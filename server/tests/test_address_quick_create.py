"""Быстрое создание адреса: контрагент сразу, домофон — по коду."""

from fastapi.testclient import TestClient

from tests.test_acts import _org
from tests.test_counterparties import _counterparty


def test_counterparty_is_set_on_create_and_fills_uk(client: TestClient, db_session):
    env = _org(client, db_session, "QuickCreate")
    headers = env.dispatcher.headers
    cp = _counterparty(client, headers)

    response = client.post(
        "/api/addresses",
        json={"address": "ул. Невская, д. 9", "counterparty_id": cp["id"]},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["counterparty_id"] == cp["id"]
    assert data["management_company"] == cp["name"]


def test_foreign_counterparty_is_rejected(client: TestClient, db_session):
    own = _org(client, db_session, "QuickOwn")
    other = _org(client, db_session, "QuickOther")
    foreign = _counterparty(client, other.dispatcher.headers)

    response = client.post(
        "/api/addresses",
        json={"address": "ул. Садовая, д. 1", "counterparty_id": foreign["id"]},
        headers=own.dispatcher.headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Контрагент не найден"


def test_intercom_code_implies_intercom(client: TestClient, db_session):
    env = _org(client, db_session, "QuickCode")

    data = client.post(
        "/api/addresses",
        json={"address": "ул. Лесная, д. 3", "intercom_code": "12#345"},
        headers=env.dispatcher.headers,
    ).json()

    assert data["has_intercom"] is True
    assert data["intercom_code"] == "12#345"
