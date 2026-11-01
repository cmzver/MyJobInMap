"""Ссылка для клиента: подпись акта без входа, PDF, проверка подлинности."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from app.models import ActModel, CommentModel
from app.services.act_service import document_hash
from tests.test_acts import _act, _org
from tests.test_acts_mobile import _png


@pytest.fixture(autouse=True)
def acts_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.act_service.acts_dir", lambda: tmp_path)
    return tmp_path


@pytest.fixture(autouse=True)
def broadcasts(monkeypatch):
    calls = []

    def fake(**kwargs):
        calls.append(kwargs)

        async def done():
            return None

        return done()

    monkeypatch.setattr("app.api.public_acts.broadcast_act_updated", fake)
    return calls


def _link(client, headers, act_id):
    response = client.post(f"/api/acts/{act_id}/public-link", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _token(link: dict) -> str:
    return link["url"].rsplit("/", 1)[-1]


def _sign(client, token, name="Петрова А. С.", consent="true", png=None):
    return client.post(
        f"/api/public/acts/{token}/sign",
        data={
            "signer_name": name,
            "consent": consent,
            "strokes": json.dumps([[[10, 20, 0], [30, 40, 16]]]),
        },
        files={"signature": ("signature.png", png or _png(), "image/png")},
        headers={"User-Agent": "Mozilla/5.0 test"},
    )


class TestPublicLink:
    def test_customer_views_and_signs_by_link(
        self, client: TestClient, db_session, acts_dir, broadcasts
    ):
        ctx = _org(client, db_session, "LinkOrg")
        act = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            customer_phone="+7 921 555-12-34",
        ).json()

        link = _link(client, ctx.worker.headers, act["id"])
        assert link["url"].startswith("http://testserver/portal/a/")
        token = _token(link)

        view = client.get(f"/api/public/acts/{token}")
        assert view.status_code == 200, view.text
        assert (view.json()["status"], view.json()["can_sign"]) == (
            "pending_signature",
            True,
        )
        assert "555-12-34" not in view.text  # телефон наружу не отдаём

        signature = _png()
        signed = _sign(client, token, png=signature)

        assert signed.status_code == 200, signed.text
        body = signed.json()
        assert (body["status"], body["signed_via"], body["can_sign"]) == (
            "signed",
            "link",
            False,
        )
        assert body["customer_name"] == "Петрова А. С."
        db_session.expire_all()
        model = db_session.get(ActModel, act["id"])
        assert model.sign_ip and model.sign_device == "Mozilla/5.0 test"
        assert model.signature_strokes == [[[10, 20, 0], [30, 40, 16]]]
        assert (acts_dir / model.customer_signature_file).read_bytes() == signature
        assert model.content_snapshot["signature"]["via"] == "link"
        assert model.document_hash == document_hash(
            model.content_snapshot,
            model.requisites_snapshot,
            {"customer": hashlib.sha256(signature).hexdigest()},
        )
        assert model.document_hash != act["document_hash"]
        comment = db_session.query(CommentModel).filter_by(task_id=ctx.task.id).all()
        assert any("подписан клиентом по ссылке" in c.text for c in comment)
        assert broadcasts == [
            {
                "act_id": act["id"],
                "task_id": ctx.task.id,
                "number": act["number"],
                "status": "signed",
                "organization_id": ctx.org.id,
            }
        ]

        # Подписать второй раз нельзя, а забрать PDF по той же ссылке — можно
        assert _sign(client, token).status_code == 409
        pdf = client.get(f"/api/public/acts/{token}/pdf")
        assert pdf.status_code == 200
        assert pdf.content.startswith(b"%PDF")
        listed = client.get(
            f"/api/tasks/{ctx.task.id}/acts", headers=ctx.dispatcher.headers
        ).json()
        assert listed[0]["public_link_expires_at"]

    def test_link_needs_access_and_live_act(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "LinkAccess")
        other = _org(client, db_session, "LinkStranger")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()

        assert client.post(f"/api/acts/{act['id']}/public-link").status_code == 401
        foreign = client.post(
            f"/api/acts/{act['id']}/public-link", headers=other.worker.headers
        )
        assert foreign.status_code == 404

        client.post(
            f"/api/acts/{act['id']}/cancel",
            json={"reason": "Ошибка в сумме"},
            headers=ctx.dispatcher.headers,
        )
        cancelled = client.post(
            f"/api/acts/{act['id']}/public-link", headers=ctx.dispatcher.headers
        )
        assert cancelled.status_code == 400

    def test_wrong_replaced_expired_and_cancelled_links(
        self, client: TestClient, db_session
    ):
        ctx = _org(client, db_session, "LinkLife")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        first = _token(_link(client, ctx.dispatcher.headers, act["id"]))
        second = _token(_link(client, ctx.dispatcher.headers, act["id"]))

        assert client.get("/api/public/acts/not-a-token").status_code == 404
        assert client.get(f"/api/public/acts/{first}").status_code == 404
        assert client.get(f"/api/public/acts/{second}").status_code == 200

        model = db_session.get(ActModel, act["id"])
        model.public_link_expires_at = datetime.now(timezone.utc).replace(
            tzinfo=None
        ) - timedelta(minutes=1)
        db_session.commit()
        assert client.get(f"/api/public/acts/{second}").status_code == 404

        third = _token(_link(client, ctx.dispatcher.headers, act["id"]))
        client.post(
            f"/api/acts/{act['id']}/cancel",
            json={"reason": "Ошибка в сумме"},
            headers=ctx.dispatcher.headers,
        )
        assert client.get(f"/api/public/acts/{third}").status_code == 404
        assert _sign(client, third).status_code == 404

    def test_sign_validation(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "LinkCheck")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        token = _token(_link(client, ctx.dispatcher.headers, act["id"]))

        assert _sign(client, token, consent="false").status_code == 400
        assert _sign(client, token, name=" ").status_code == 400
        assert _sign(client, token, png=b"not a png").status_code == 415
        assert client.get(f"/api/public/acts/{token}").json()["can_sign"] is True


class TestVerification:
    def test_verify_by_number_and_checksum(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "VerOrg")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        short = act["document_hash"][:16]

        found = client.get(
            "/api/public/acts/verify", params={"number": act["number"], "h": short}
        )
        assert found.status_code == 200, found.text
        assert (found.json()["status"], found.json()["organization"]) == (
            "pending_signature",
            "VerOrg",
        )
        wrong = client.get(
            "/api/public/acts/verify",
            params={"number": act["number"], "h": "0" * 16},
        )
        assert wrong.status_code == 404
        too_short = client.get(
            "/api/public/acts/verify", params={"number": act["number"], "h": short[:8]}
        )
        assert too_short.status_code == 422

        replacement = _act(
            client,
            ctx.dispatcher.headers,
            ctx.task.id,
            supersedes_act_id=act["id"],
        ).json()
        cancelled = client.get(
            "/api/public/acts/verify", params={"number": act["number"], "h": short}
        ).json()
        assert (cancelled["status"], cancelled["replaced_by"]) == (
            "cancelled",
            replacement["number"],
        )

    def test_pdf_carries_verification_qr(
        self, client: TestClient, db_session, monkeypatch
    ):
        ctx = _org(client, db_session, "QrOrg")
        act = _act(client, ctx.dispatcher.headers, ctx.task.id).json()
        drawn = []
        monkeypatch.setattr(
            "app.services.act_pdf._draw_qr",
            lambda canvas, value, x, y, size: drawn.append(value),
        )

        response = client.get(
            f"/api/acts/{act['id']}/pdf",
            headers={**ctx.dispatcher.headers, "X-Forwarded-Proto": "https"},
        )

        assert response.status_code == 200
        assert drawn[0] == (
            "https://testserver/portal/acts/verify"
            f"?n={quote(act['number'], safe='')}&h={act['document_hash'][:16]}"
        )
