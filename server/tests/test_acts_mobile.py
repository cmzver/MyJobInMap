"""Акт с телефона мастера: подпись клиента на экране, отказ, офлайн-повтор."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.models import ActModel, CommentModel, TaskModel, TaskStatus
from app.services.act_service import document_hash
from tests.test_acts import _org


@pytest.fixture(autouse=True)
def acts_dir(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.act_service.acts_dir", lambda: tmp_path)
    return tmp_path


def _png(color="black") -> bytes:
    image = Image.new("RGBA", (400, 160), (0, 0, 0, 0))
    for x in range(20, 380):
        image.putpixel(
            (x, 80 + (x % 30) - 15), Image.new("RGBA", (1, 1), color).getpixel((0, 0))
        )
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _payload(**fields) -> str:
    return json.dumps(
        {
            "lines": [{"name": "Замена трубки", "price": 1500}],
            "customer_name": "Петров П. П.",
            "apartment": "45",
            "work_summary": "Заменена трубка",
            **fields,
        },
        ensure_ascii=False,
    )


def _post(client, headers, task_id, payload, key=None, **files):
    request_headers = dict(headers)
    if key:
        request_headers["Idempotency-Key"] = key
    parts = {name: (f"{name}.png", data, "image/png") for name, data in files.items()}
    return client.post(
        f"/api/tasks/{task_id}/acts/mobile",
        data={"payload": payload, "strokes": json.dumps([[[10, 20, 0], [30, 40, 16]]])},
        files=parts or None,
        headers=request_headers,
    )


class TestMobileAct:
    def test_signed_on_screen(self, client: TestClient, db_session, acts_dir):
        ctx = _org(client, db_session, "MobOrg")
        signed_at = datetime.now(timezone.utc) - timedelta(hours=2)
        customer, worker = _png(), _png("navy")

        response = _post(
            client,
            ctx.worker.headers,
            ctx.task.id,
            _payload(signed_at=signed_at.isoformat(), sign_lat=59.9, sign_lon=30.3),
            customer_signature=customer,
            worker_signature=worker,
        )

        assert response.status_code == 201, response.text
        act = response.json()
        assert (act["status"], act["has_customer_signature"]) == ("signed", True)
        model = db_session.get(ActModel, act["id"])
        assert model.signed_via == "screen"
        assert abs(model.signed_at - signed_at.replace(tzinfo=None)) < timedelta(
            seconds=1
        )
        assert model.signature_strokes == [[[10, 20, 0], [30, 40, 16]]]
        assert (acts_dir / model.customer_signature_file).read_bytes() == customer
        assert model.document_hash == document_hash(
            model.content_snapshot,
            model.requisites_snapshot,
            {
                "customer": hashlib.sha256(customer).hexdigest(),
                "worker": hashlib.sha256(worker).hexdigest(),
            },
        )
        pdf = client.get(f"/api/acts/{act['id']}/pdf", headers=ctx.dispatcher.headers)
        assert pdf.content.startswith(b"%PDF")

    def test_implausible_signing_time_is_replaced(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "TimeOrg")
        future = datetime.now(timezone.utc) + timedelta(days=1)

        act = _post(
            client,
            ctx.worker.headers,
            ctx.task.id,
            _payload(signed_at=future.isoformat()),
            customer_signature=_png(),
        ).json()

        model = db_session.get(ActModel, act["id"])
        assert model.signed_at < datetime.now(timezone.utc).replace(
            tzinfo=None
        ) + timedelta(minutes=1)

    def test_refused_and_pending(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "RefOrg")

        refused = _post(
            client,
            ctx.worker.headers,
            ctx.task.id,
            _payload(refusal_reason="Не согласен с суммой"),
        ).json()
        pending = _post(client, ctx.worker.headers, ctx.task.id, _payload()).json()

        assert (refused["status"], refused["refusal_reason"]) == (
            "refused",
            "Не согласен с суммой",
        )
        assert pending["status"] == "pending_signature"
        pdf = client.get(
            f"/api/acts/{refused['id']}/pdf", headers=ctx.dispatcher.headers
        )
        assert pdf.content.startswith(b"%PDF")

    def test_offline_retry_does_not_duplicate(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "IdemOrg")
        signature = _png()

        first = _post(
            client,
            ctx.worker.headers,
            ctx.task.id,
            _payload(),
            "op-1",
            customer_signature=signature,
        )
        again = _post(
            client,
            ctx.worker.headers,
            ctx.task.id,
            _payload(),
            "op-1",
            customer_signature=signature,
        )

        assert first.status_code == again.status_code == 201
        assert first.json()["id"] == again.json()["id"]
        assert (
            db_session.query(ActModel).filter(ActModel.task_id == ctx.task.id).count()
            == 1
        )
        comments = db_session.query(CommentModel).filter(
            CommentModel.task_id == ctx.task.id
        )
        assert sum("Оформлен акт" in c.text for c in comments) == 1

    def test_rejects_bad_signature_and_payload(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "BadSig")
        jpeg = BytesIO()
        Image.new("RGB", (50, 50), "white").save(jpeg, format="JPEG")

        not_png = _post(
            client,
            ctx.worker.headers,
            ctx.task.id,
            _payload(),
            customer_signature=jpeg.getvalue(),
        )
        broken = _post(client, ctx.worker.headers, ctx.task.id, "{not json")

        assert not_png.status_code == 415
        assert broken.status_code == 422
        assert db_session.query(ActModel).count() == 0

    def test_worker_only_for_own_task(self, client: TestClient, db_session):
        ctx = _org(client, db_session, "OwnOrg")
        stranger = TaskModel(
            title="Чужая",
            raw_address="ул. Садовая, д. 1",
            description="",
            status=TaskStatus.NEW.value,
            organization_id=ctx.org.id,
        )
        db_session.add(stranger)
        db_session.commit()

        response = _post(client, ctx.worker.headers, stranger.id, _payload())

        assert response.status_code == 403
