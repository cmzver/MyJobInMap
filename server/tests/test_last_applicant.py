"""Заявитель прошлой заявки с той же квартиры — подсказка в форме заявки."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.models import TaskModel
from app.services.repeat_detector import address_key
from tests.test_acts import _org


def _task(db_session, env, raw_address, name, phone, days_ago, number):
    task = TaskModel(
        title=raw_address,
        raw_address=raw_address,
        address_key=address_key(raw_address),
        description="",
        status="DONE",
        organization_id=env.org.id,
        customer_name=name,
        customer_phone=phone,
        task_number=number,
        created_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    )
    db_session.add(task)
    db_session.commit()
    return task


def _ask(client, env, address, who="dispatcher"):
    return client.get(
        "/api/tasks/last-applicant",
        params={"address": address},
        headers=getattr(env, who).headers,
    )


def test_latest_applicant_of_the_same_flat(client: TestClient, db_session):
    env = _org(client, db_session, "Applicant")
    _task(
        db_session,
        env,
        "СПб, Невская ул., д. 9, кв. 15",
        "Старый",
        "+70000000000",
        30,
        "Z-1",
    )
    _task(db_session, env, "Невская 9, кв 15", "Иванова", "+79211234567", 2, "Z-2")
    _task(
        db_session,
        env,
        "СПб, Невская ул., д. 9, кв. 16",
        "Соседка",
        "+79990000000",
        1,
        "Z-3",
    )

    data = _ask(
        client, env, "Санкт-Петербург, ул. Невская, д. 9, под. 2, кв. 15"
    ).json()

    assert (data["customer_name"], data["customer_phone"], data["task_number"]) == (
        "Иванова",
        "+79211234567",
        "Z-2",
    )


def test_no_flat_matches_only_tasks_without_flat_and_city_must_agree(
    client: TestClient, db_session
):
    env = _org(client, db_session, "ApplicantHouse")
    _task(db_session, env, "Невская ул., д. 9, кв. 15", "Квартира", "+71", 1, "Z-1")
    _task(
        db_session, env, "Кронштадт, Невская ул., д. 9", "Другой город", "+72", 1, "Z-2"
    )
    _task(db_session, env, "СПб, Невская ул., д. 9", "Дом", "+73", 3, "Z-3")

    data = _ask(client, env, "СПб, Невская, 9").json()

    assert data["customer_name"] == "Дом"
    assert _ask(client, env, "СПб, Садовая, 1").json() is None


def test_workers_do_not_get_other_applicants(client: TestClient, db_session):
    env = _org(client, db_session, "ApplicantWorker")

    assert _ask(client, env, "Невская 9", who="worker").status_code == 403
