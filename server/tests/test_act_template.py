"""Бланк акта организации: настройки, логотип, предпросмотр, заморозка в акте."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.models import ActModel, UserRole
from tests.test_acts import _act, _org
from tests.test_multitenant_isolation_api import _create_org_user, _login_headers

URL = "/api/admin/organization-settings"


@pytest.fixture(autouse=True)
def logos_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.services.organization_settings_service.logos_dir",
        lambda: tmp_path / "logos",
    )


def _admin_headers(client, db_session, ctx):
    admin = _create_org_user(
        db_session,
        username=f"{ctx.org.slug}-admin",
        password="pass123",
        role=UserRole.ADMIN.value,
        organization_id=ctx.org.id,
    )
    return _login_headers(client, admin.username, "pass123")


def _png(size=(1200, 300)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, "#E65100").save(buffer, format="PNG")
    return buffer.getvalue()


def _settings(client, headers, **template):
    current = client.get(URL, headers=headers).json()
    payload = {
        key: value
        for key, value in current.items()
        if key not in ("organization_id", "sla_hours_customized", "has_act_logo")
    }
    payload["sla_hours"] = None
    payload["act_template"] = {**current["act_template"], **template}
    return payload


def test_template_defaults_and_save(client: TestClient, db_session):
    ctx = _org(client, db_session, "TplOrg")
    headers = _admin_headers(client, db_session, ctx)

    defaults = client.get(URL, headers=headers).json()["act_template"]
    saved = client.put(
        URL,
        json=_settings(
            client,
            headers,
            title="Акт сдачи-приёмки работ",
            accent_color="#1D4ED8",
            show_prices=False,
        ),
        headers=headers,
    )
    bad_color = client.put(
        URL, json=_settings(client, headers, accent_color="blue"), headers=headers
    )

    assert defaults["title"] == "Акт выполненных работ"
    assert defaults["show_prices"] is True
    assert saved.status_code == 200, saved.text
    assert saved.json()["act_template"]["title"] == "Акт сдачи-приёмки работ"
    assert saved.json()["act_template"]["show_prices"] is False
    assert bad_color.status_code == 422


def test_logo_upload_read_and_remove(client: TestClient, db_session):
    ctx = _org(client, db_session, "LogoOrg")
    headers = _admin_headers(client, db_session, ctx)

    not_image = client.put(
        f"{URL}/logo",
        files={"file": ("a.png", b"not an image", "image/png")},
        headers=headers,
    )
    uploaded = client.put(
        f"{URL}/logo",
        files={"file": ("logo.png", _png(), "image/png")},
        headers=headers,
    )
    logo = client.get(f"{URL}/logo", headers=headers)
    removed = client.delete(f"{URL}/logo", headers=headers)

    assert not_image.status_code == 415
    assert uploaded.json()["has_act_logo"] is True
    stored = Image.open(BytesIO(logo.content))
    assert stored.format == "PNG" and stored.size[0] <= 800
    assert removed.json()["has_act_logo"] is False
    assert client.get(f"{URL}/logo", headers=headers).status_code == 404


def _encoded(fmt: str, mode: str = "RGB") -> bytes:
    buffer = BytesIO()
    Image.new(mode, (400, 120), "#E65100").save(buffer, format=fmt)
    return buffer.getvalue()


def test_logo_format_is_read_from_content(client: TestClient, db_session):
    """«logo.png» с сайта бывает WebP: берём любую обычную картинку, храним PNG."""
    ctx = _org(client, db_session, "LogoFormats")
    headers = _admin_headers(client, db_session, ctx)

    def upload(content: bytes, name: str = "logo.png"):
        return client.put(
            f"{URL}/logo", files={"file": (name, content, "image/png")}, headers=headers
        )

    for fmt in ("WEBP", "JPEG", "GIF", "BMP"):
        response = upload(_encoded(fmt))
        assert response.status_code == 200, (fmt, response.text)
        stored = Image.open(BytesIO(client.get(f"{URL}/logo", headers=headers).content))
        assert stored.format == "PNG"

    svg = upload(b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')
    assert svg.status_code == 415 and "SVG" in svg.json()["detail"]
    ico = upload(_encoded("ICO", "RGBA"))
    assert ico.status_code == 415 and "ICO" in ico.json()["detail"]
    broken = bytearray(_png())
    broken[-20] ^= 0xFF  # контрольная сумма PNG не сойдётся
    assert upload(bytes(broken)).status_code == 415


def test_preview_uses_unsaved_template(client: TestClient, db_session):
    ctx = _org(client, db_session, "PrevOrg")
    headers = _admin_headers(client, db_session, ctx)
    client.put(
        f"{URL}/logo",
        files={"file": ("logo.png", _png(), "image/png")},
        headers=headers,
    )

    response = client.post(
        f"{URL}/act-preview",
        json=_settings(client, headers, show_prices=False, show_stamp_place=False),
        headers=headers,
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_issued_act_keeps_its_template(client: TestClient, db_session):
    ctx = _org(client, db_session, "FrozenOrg")
    headers = _admin_headers(client, db_session, ctx)
    client.put(
        URL, json=_settings(client, headers, title="Первый бланк"), headers=headers
    )
    client.put(
        f"{URL}/logo",
        files={"file": ("logo.png", _png(), "image/png")},
        headers=headers,
    )
    act = _act(client, headers, ctx.task.id).json()

    client.put(
        URL, json=_settings(client, headers, title="Второй бланк"), headers=headers
    )
    client.delete(f"{URL}/logo", headers=headers)
    pdf = client.get(f"/api/acts/{act['id']}/pdf", headers=headers)

    snapshot = db_session.get(ActModel, act["id"]).requisites_snapshot
    assert snapshot["template"]["title"] == "Первый бланк"
    assert snapshot["logo_file"]
    assert pdf.content.startswith(b"%PDF")
