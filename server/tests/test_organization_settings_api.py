"""Реквизиты, настройки актов и нормативы сроков организации."""

from fastapi.testclient import TestClient

from app.models import OrganizationModel, UserRole
from tests.test_multitenant_isolation_api import _create_org_user, _login_headers

URL = "/api/admin/organization-settings"

REQUISITES = {
    "legal_name": "ООО «Техно-Спектр»",
    "inn": "7801234567",
    "kpp": "780101001",
    "ogrn": "1027800000000",
    "legal_address": "СПб, Невский пр., д. 1",
    "bank_name": "ПАО Банк",
    "bik": "044030001",
    "account": "40702810000000000001",
    "corr_account": "30101810000000000001",
    "director_name": "Иванов И. И.",
    "director_title": "Генеральный директор",
    "act_number_prefix": "ТС",
    "act_footer_text": "Гарантия на работы — 6 месяцев.",
}
HOURS = {"EMERGENCY": 2, "URGENT": 6, "CURRENT": 24, "PLANNED": 120}


def _org_admin(client: TestClient, db_session, name: str):
    org = OrganizationModel(name=name, slug=name.lower())
    db_session.add(org)
    db_session.commit()
    admin = _create_org_user(
        db_session,
        username=f"{name.lower()}-admin",
        password="pass123",
        role=UserRole.ADMIN.value,
        organization_id=org.id,
    )
    return org, _login_headers(client, admin.username, "pass123")


def test_defaults_before_first_save(client: TestClient, db_session):
    org, headers = _org_admin(client, db_session, "Fresh")

    response = client.get(URL, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert data["organization_id"] == org.id
    assert data["legal_name"] is None
    assert data["act_number_prefix"] == "А"
    assert data["sla_hours"] == {
        "EMERGENCY": 4,
        "URGENT": 8,
        "CURRENT": 48,
        "PLANNED": 168,
    }
    assert data["sla_hours_customized"] is False


def test_org_admin_saves_requisites_and_hours(client: TestClient, db_session):
    _, headers = _org_admin(client, db_session, "Spectr")

    saved = client.put(URL, json={**REQUISITES, "sla_hours": HOURS}, headers=headers)
    assert saved.status_code == 200
    assert saved.json()["sla_hours"] == HOURS

    data = client.get(URL, headers=headers).json()
    assert {key: data[key] for key in REQUISITES} == REQUISITES
    assert data["sla_hours"] == HOURS
    assert data["sla_hours_customized"] is True

    # null — назад к нормативам по умолчанию, реквизиты не трогаются.
    reset = client.put(URL, json={**REQUISITES, "sla_hours": None}, headers=headers)
    assert reset.json()["sla_hours"]["EMERGENCY"] == 4
    assert reset.json()["sla_hours_customized"] is False
    assert reset.json()["legal_name"] == REQUISITES["legal_name"]


def test_rejects_malformed_requisites(client: TestClient, db_session):
    _, headers = _org_admin(client, db_session, "Typos")

    response = client.put(URL, json={"inn": "12345"}, headers=headers)

    assert response.status_code == 422


def test_org_admin_cannot_touch_other_organization(client: TestClient, db_session):
    other, _ = _org_admin(client, db_session, "Other")
    _, headers = _org_admin(client, db_session, "Mine")

    response = client.get(URL, params={"organization_id": other.id}, headers=headers)

    assert response.status_code == 403


def test_superadmin_picks_organization(
    client: TestClient, db_session, auth_headers: dict
):
    org, _ = _org_admin(client, db_session, "Picked")

    assert client.get(URL, headers=auth_headers).status_code == 400
    saved = client.put(
        URL,
        params={"organization_id": org.id},
        json={"legal_name": "ООО «Выбранная»"},
        headers=auth_headers,
    )
    assert saved.status_code == 200
    assert saved.json()["legal_name"] == "ООО «Выбранная»"
    assert (
        client.get(
            URL, params={"organization_id": 999999}, headers=auth_headers
        ).status_code
        == 404
    )


def test_worker_has_no_access(client: TestClient, db_session):
    org, _ = _org_admin(client, db_session, "Workers")
    worker = _create_org_user(
        db_session,
        username="plain-worker",
        password="pass123",
        role=UserRole.WORKER.value,
        organization_id=org.id,
    )

    response = client.get(
        URL, headers=_login_headers(client, worker.username, "pass123")
    )

    assert response.status_code == 403
