"""Заявки дома — привязанные к нему, без совпадений по подстрокам адреса."""

from fastapi.testclient import TestClient

from app.models import TaskModel, TaskStatus
from tests.test_acts import _org


def _task(db_session, org_id, raw_address, number, lat=None, lon=None):
    task = TaskModel(
        title=raw_address,
        raw_address=raw_address,
        description="",
        status=TaskStatus.NEW.value,
        organization_id=org_id,
        task_number=number,
        lat=lat,
        lon=lon,
    )
    db_session.add(task)
    db_session.commit()
    return task


def test_new_house_takes_its_earlier_tasks_and_their_point(
    client: TestClient, db_session
):
    env = _org(client, db_session, "LinkNew")  # заявка «ул. Невская, д. 9»
    other_house = _task(db_session, env.org.id, "ул. Невская, д. 19", "L-2")
    stranger = _org(client, db_session, "LinkStranger").task  # тот же адрес, чужая орг.

    created = client.post(
        "/api/addresses",
        json={"address": "Невская ул., 9", "lat": 59.85, "lon": 30.6},
        headers=env.dispatcher.headers,
    ).json()

    for task in (env.task, other_house, stranger):
        db_session.refresh(task)
    assert env.task.address_id == created["id"]
    assert (env.task.lat, env.task.lon) == (59.85, 30.6)
    assert other_house.address_id is None
    assert stranger.address_id is None

    card = client.get(
        f"/api/addresses/{created['id']}/full", headers=env.dispatcher.headers
    ).json()
    assert card["task_stats"]["total"] == 1


def test_house_one_does_not_show_tasks_of_house_eleven_slash_one(
    client: TestClient, db_session
):
    env = _org(client, db_session, "LinkSlash")
    eleven = _task(db_session, env.org.id, "ул. Садовая, д. 11/1", "S-11")
    one = _task(db_session, env.org.id, "ул. Садовая, д. 1", "S-1")

    created = client.post(
        "/api/addresses",
        json={"address": "Садовая ул., 1", "lat": 59.9, "lon": 30.3},
        headers=env.dispatcher.headers,
    ).json()

    listed = client.get(
        "/api/tasks",
        params={"address_id": created["id"]},
        headers=env.dispatcher.headers,
    ).json()
    items = listed["items"] if isinstance(listed, dict) else listed
    assert [item["id"] for item in items] == [one.id]
    db_session.refresh(eleven)
    assert eleven.address_id is None


def test_renamed_house_picks_up_tasks_of_its_new_address(
    client: TestClient, db_session
):
    env = _org(client, db_session, "LinkRename")
    task = _task(db_session, env.org.id, "пр. Энгельса, д. 120", "E-120")
    created = client.post(
        "/api/addresses",
        json={"address": "Энгельса пр., 12", "lat": 60.0, "lon": 30.3},
        headers=env.dispatcher.headers,
    ).json()
    db_session.refresh(task)
    assert task.address_id is None

    client.patch(
        f"/api/addresses/{created['id']}",
        json={"address": "Энгельса пр., 120", "lat": 60.01, "lon": 30.31},
        headers=env.dispatcher.headers,
    )
    db_session.refresh(task)
    assert task.address_id == created["id"]
    assert (task.lat, task.lon) == (60.01, 30.31)


def test_backfill_script_links_old_tasks_and_geocodes_the_rest(
    client: TestClient, db_session, monkeypatch
):
    import importlib.util
    from pathlib import Path

    from app.models import AddressModel
    from app.services.geocoding import geocoding_service

    spec = importlib.util.spec_from_file_location(
        "link_tasks_to_addresses",
        Path(__file__).parent.parent / "scripts" / "link_tasks_to_addresses.py",
    )
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)

    env = _org(client, db_session, "LinkBackfill")  # «ул. Невская, д. 9»
    # Дом заведён «старым» способом — без привязки заявок
    house = AddressModel(
        address="Невская ул., 9",
        street="Невская ул.",
        building="9",
        lat=59.85,
        lon=30.6,
        organization_id=env.org.id,
    )
    db_session.add(house)
    lost = _task(db_session, env.org.id, "Центральная, д. 3, Кудрово", "C-3", 0.0, 0.0)
    db_session.commit()
    monkeypatch.setattr(geocoding_service, "geocode", lambda raw: (59.9, 30.5))

    assert script.run(db_session, geocode=True, dry_run=True, pause=0) == {
        "linked": 1,
        "located": 1,
        "still_missing": 0,
    }
    db_session.refresh(env.task)
    assert env.task.address_id is None

    script.run(db_session, geocode=True, pause=0)
    db_session.refresh(env.task)
    db_session.refresh(lost)
    assert env.task.address_id == house.id
    assert (lost.lat, lost.lon) == (59.9, 30.5)
