"""Подсказки адресов: своя база с правильным ранжированием + справочник DaData."""

import httpx
from fastapi.testclient import TestClient

from app.api.addresses.core import _rank_matches
from app.config import settings
from app.models import AddressModel
from app.services import address_suggest
from tests.test_acts import _org


def _fake_dadata(monkeypatch, suggestions, calls=None):
    monkeypatch.setattr(settings, "DADATA_API_KEY", "test-key")

    def fake_post(url, json, headers, timeout):
        if calls is not None:
            calls.append(json)
        assert headers["Authorization"] == "Token test-key"
        request = httpx.Request("POST", url)
        return httpx.Response(200, json={"suggestions": suggestions}, request=request)

    monkeypatch.setattr(address_suggest, "_http_post", fake_post)


def _suggestion(value, **data):
    return {"value": value, "unrestricted_value": f"198000, {value}", "data": data}


def test_rank_prefers_prefix_then_word_then_substring():
    values = ["Большая Пушкарская ул.", "Пушкина ул.", "Опушкина ул."]
    assert _rank_matches(values, "пушк", 10) == [
        "Пушкина ул.",
        "Большая Пушкарская ул.",
        "Опушкина ул.",
    ]
    assert _rank_matches(["Ёлочная ул."], "елоч", 10) == ["Ёлочная ул."]


def test_street_beyond_first_alphabetical_rows_is_found(client: TestClient, db_session):
    env = _org(client, db_session, "SuggestMany")
    for i in range(60):
        db_session.add(
            AddressModel(
                address=f"ул. А{i:02d}, 1",
                city="Санкт-Петербург",
                street=f"А{i:02d} ул.",
                organization_id=env.org.id,
            )
        )
    db_session.add(
        AddressModel(
            address="ул. Ясная, 1",
            city="Санкт-Петербург",
            street="Ясная ул.",
            organization_id=env.org.id,
        )
    )
    db_session.commit()

    response = client.get(
        "/api/addresses/autocomplete/streets",
        params={"q": "ясн"},
        headers=env.dispatcher.headers,
    )

    assert response.json() == ["Ясная ул."]


def test_without_key_full_address_comes_from_own_base(client: TestClient, db_session):
    env = _org(client, db_session, "SuggestBase")
    db_session.add(
        AddressModel(
            address="ул. Невская, д. 9",
            street="Невская ул.",
            building="9",
            organization_id=env.org.id,
        )
    )
    db_session.commit()

    items = client.get(
        "/api/addresses/autocomplete/address",
        params={"q": "Невская"},
        headers=env.dispatcher.headers,
    ).json()

    assert [item["value"] for item in items] == ["ул. Невская, д. 9"]
    assert items[0]["source"] == "base"
    assert items[0]["address_id"] is not None


def test_dadata_full_address_is_split_into_parts(
    client: TestClient, db_session, monkeypatch
):
    env = _org(client, db_session, "SuggestDadata")
    calls = []
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "г Санкт-Петербург, пр-кт Ветеранов, д 46",
                city="Санкт-Петербург",
                street_with_type="пр-кт Ветеранов",
                house="46",
                geo_lat="59.8417",
                geo_lon="30.2391",
            ),
            _suggestion(
                "Ленинградская обл, гп Новоселье, ул Центральная, д 3 к 1",
                settlement="Новоселье",
                street_with_type="ул Центральная",
                house="3",
                block_type="к",
                block="1",
            ),
            _suggestion(
                "г Санкт-Петербург, ул Седова, д 12 стр 2",
                city="Санкт-Петербург",
                street_with_type="ул Седова",
                house="12",
                block_type="стр",
                block_type_full="строение",
                block="2",
            ),
        ],
        calls,
    )

    items = client.get(
        "/api/addresses/autocomplete/address",
        params={"q": "ветеранов 46"},
        headers=env.dispatcher.headers,
    ).json()

    assert calls[0]["locations_boost"] == [{"kladr_id": "78"}, {"kladr_id": "47"}]
    first, second, third = items
    assert (first["city"], first["street"], first["building"]) == (
        "Санкт-Петербург",
        "пр-кт Ветеранов",
        "46",
    )
    assert (first["lat"], first["lon"]) == (59.8417, 30.2391)
    assert (second["city"], second["corpus"]) == ("Новоселье", "1")
    # Строение — не корпус: остаётся в номере дома
    assert (third["building"], third["corpus"]) == ("12 строение 2", "")


def test_cities_merge_own_first_and_cache_saves_quota(
    client: TestClient, db_session, monkeypatch
):
    env = _org(client, db_session, "SuggestCities")
    db_session.add(
        AddressModel(address="x", city="Сестрорецк", organization_id=env.org.id)
    )
    db_session.commit()
    calls = []
    _fake_dadata(
        monkeypatch,
        [
            _suggestion("г Сестрорецк", city="Сестрорецк"),
            _suggestion("г Сертолово", city="Сертолово"),
        ],
        calls,
    )

    for _ in range(2):
        cities = client.get(
            "/api/addresses/autocomplete/cities",
            params={"q": "се"},
            headers=env.dispatcher.headers,
        ).json()

    assert cities == ["Сестрорецк", "Сертолово"]
    assert len(calls) == 1
    assert calls[0]["from_bound"] == {"value": "city"}


def test_dadata_failure_falls_back_quietly(
    client: TestClient, db_session, monkeypatch, caplog
):
    env = _org(client, db_session, "SuggestDown")
    monkeypatch.setattr(settings, "DADATA_API_KEY", "secret-key-123")

    def broken_post(*args, **kwargs):
        raise httpx.ConnectTimeout("timeout")

    monkeypatch.setattr(address_suggest, "_http_post", broken_post)

    response = client.get(
        "/api/addresses/autocomplete/streets",
        params={"q": "нев"},
        headers=env.dispatcher.headers,
    )

    assert response.status_code == 200
    assert response.json() == []
    assert "secret-key-123" not in caplog.text


def test_streets_drop_metro_and_unrelated_and_respect_city(
    client: TestClient, db_session, monkeypatch
):
    env = _org(client, db_session, "SuggestStreets")
    calls = []
    _fake_dadata(
        monkeypatch,
        [
            _suggestion("пр-кт Ветеранов", street_with_type="пр-кт Ветеранов"),
            _suggestion(
                "метро Проспект Ветеранов",
                street_with_type="метро Проспект Ветеранов",
                street_type="м",
            ),
            _suggestion(
                "тер. СНТ Ветеран, пр-д 1-й",
                street_with_type="пр-д 1-й",
                street_type="пр-д",
                settlement_type="тер. СНТ",
            ),
        ],
        calls,
    )

    streets = client.get(
        "/api/addresses/autocomplete/streets",
        params={"q": "ветер", "city": "СПб"},
        headers=env.dispatcher.headers,
    ).json()

    assert streets == ["пр-кт Ветеранов"]
    assert calls[0]["locations"] == [
        {"city": "Санкт-Петербург"},
        {"settlement": "Санкт-Петербург"},
    ]


def test_full_address_stops_at_house_and_cities_stay_in_regions(
    client: TestClient, db_session, monkeypatch
):
    env = _org(client, db_session, "SuggestBounds")
    calls = []
    _fake_dadata(
        monkeypatch, [_suggestion("г Санкт-Петербург", city="Санкт-Петербург")], calls
    )

    client.get(
        "/api/addresses/autocomplete/address",
        params={"q": "ветеранов 46"},
        headers=env.dispatcher.headers,
    )
    cities = client.get(
        "/api/addresses/autocomplete/cities",
        params={"q": "спб"},
        headers=env.dispatcher.headers,
    ).json()

    assert calls[0]["to_bound"] == {"value": "house"}
    assert calls[1]["locations"] == [{"kladr_id": "78"}, {"kladr_id": "47"}]
    assert cities == ["Санкт-Петербург"]


def test_find_by_components_matches_directory_style_street(
    client: TestClient, db_session
):
    env = _org(client, db_session, "FindParts")
    db_session.add_all(
        [
            AddressModel(
                address="Ветеранов пр., д. 46, СПб",
                city="Санкт-Петербург",
                street="Ветеранов пр.",
                building="46",
                organization_id=env.org.id,
            ),
            AddressModel(
                address="Ветеранов пр., д. 46, к. 2, СПб",
                city="Санкт-Петербург",
                street="Ветеранов пр.",
                building="46",
                corpus="2",
                organization_id=env.org.id,
            ),
        ]
    )
    db_session.commit()

    def find(**params):
        return client.get(
            "/api/addresses/find-by-components",
            params={"city": "Санкт-Петербург", **params},
            headers=env.dispatcher.headers,
        ).json()

    assert find(street="пр-кт Ветеранов", building="46")["address"] == (
        "Ветеранов пр., д. 46, СПб"
    )
    assert find(street="пр-кт Ветеранов", building="46", corpus="2")["address"] == (
        "Ветеранов пр., д. 46, к. 2, СПб"
    )
    assert find(street="пр-кт Ветеранов", building="48") is None


def test_full_address_lists_own_objects_first_without_duplicates(
    client: TestClient, db_session, monkeypatch
):
    env = _org(client, db_session, "SuggestMixed")
    db_session.add(
        AddressModel(
            address="Ветеранов пр., д. 46, СПб",
            city="Санкт-Петербург",
            street="Ветеранов пр.",
            building="46",
            organization_id=env.org.id,
        )
    )
    db_session.commit()
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "г Санкт-Петербург, пр-кт Ветеранов, д 46",
                city="Санкт-Петербург",
                street_with_type="пр-кт Ветеранов",
                house="46",
            ),
            _suggestion(
                "г Санкт-Петербург, пр-кт Ветеранов, д 48",
                city="Санкт-Петербург",
                street_with_type="пр-кт Ветеранов",
                house="48",
            ),
        ],
    )

    items = client.get(
        "/api/addresses/autocomplete/address",
        params={"q": "ветеранов 4"},
        headers=env.dispatcher.headers,
    ).json()

    assert [(i["source"], i["value"]) for i in items] == [
        ("base", "Ветеранов пр., д. 46, СПб"),
        ("dadata", "г Санкт-Петербург, пр-кт Ветеранов, д 48"),
    ]


def test_house_district_and_fias_are_stored_and_searchable(
    client: TestClient, db_session, monkeypatch
):
    env = _org(client, db_session, "SuggestDistrict")
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "г Санкт-Петербург, пр-кт Ветеранов, д 46",
                city="Санкт-Петербург",
                city_district_with_type="Кировский р-н",
                street_with_type="пр-кт Ветеранов",
                house="46",
                house_fias_id="0f1a2b3c-0000-4000-8000-000000000046",
                geo_lat="59.8417",
                geo_lon="30.2391",
            )
        ],
    )

    created = client.post(
        "/api/addresses",
        json={"address": "Санкт-Петербург, пр. Ветеранов, 46"},
        headers=env.dispatcher.headers,
    ).json()
    assert created["district"] == "Кировский р-н"
    assert created["fias_id"] == "0f1a2b3c-0000-4000-8000-000000000046"

    found = client.get(
        "/api/addresses", params={"search": "Кировский"}, headers=env.dispatcher.headers
    ).json()
    assert [item["id"] for item in found["items"]] == [created["id"]]

    # Другой дом, которого справочник не знает, — старый район не остаётся
    _fake_dadata(monkeypatch, [])
    address_suggest.clear_cache()
    updated = client.patch(
        f"/api/addresses/{created['id']}",
        json={"address": "Санкт-Петербург, ул. Неизвестная, 1"},
        headers=env.dispatcher.headers,
    ).json()
    assert (updated["district"], updated["fias_id"]) == (None, None)


def test_settlement_gets_oblast_district_and_street_match_is_not_a_house(monkeypatch):
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "Ленинградская обл, Всеволожский р-н, гп Новоселье, ул Невская, д 9",
                settlement="Новоселье",
                area_with_type="Всеволожский р-н",
                house="9",
                house_fias_id="aaaa",
            )
        ],
    )
    assert address_suggest.house_details("Новоселье, Невская 9") == {
        "district": "Всеволожский р-н",
        "fias_id": "aaaa",
    }

    address_suggest.clear_cache()
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "г Санкт-Петербург, ул Невская",
                city_district_with_type="Невский р-н",
                fias_id="bbbb",
            )
        ],
    )
    assert address_suggest.house_details("Невская") is None

    # Дом узнан, но кода ФИАС у него нет — район всё равно нужен
    address_suggest.clear_cache()
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "г Санкт-Петербург, пр-кт Энгельса, д 120",
                city_district_with_type="Выборгский р-н",
                house="120",
                fias_id="street-guid",
            )
        ],
    )
    assert address_suggest.house_details("пр. Энгельса, 120") == {
        "district": "Выборгский р-н",
        "fias_id": None,
    }


def test_backfill_fills_only_addresses_without_district(db_session, monkeypatch):
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "backfill_address_district",
        Path(__file__).parent.parent / "scripts" / "backfill_address_district.py",
    )
    script = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script)

    done = AddressModel(address="Готовый, 1", fias_id="keep", district="Старый")
    todo = AddressModel(address="Санкт-Петербург, Народная, 3")
    db_session.add_all([done, todo])
    db_session.commit()
    calls = []
    _fake_dadata(
        monkeypatch,
        [
            _suggestion(
                "г Санкт-Петербург, ул Народная, д 3",
                city_district_with_type="Невский р-н",
                house="3",
                house_fias_id="cccc",
            )
        ],
        calls,
    )

    assert script.backfill(db_session, dry_run=True) == {"filled": 1, "not_found": 0}
    db_session.refresh(todo)
    assert todo.fias_id is None

    assert script.backfill(db_session) == {"filled": 1, "not_found": 0}
    db_session.refresh(todo)
    db_session.refresh(done)
    assert (todo.district, todo.fias_id) == ("Невский р-н", "cccc")
    assert (done.district, done.fias_id) == ("Старый", "keep")
    assert [call["query"] for call in calls] == ["Санкт-Петербург, Народная, 3"]


def test_address_card_shows_district(client: TestClient, db_session):
    env = _org(client, db_session, "CardDistrict")
    address = AddressModel(
        address="Санкт-Петербург, Народная, 3",
        district="Невский р-н",
        fias_id="dddd",
        organization_id=env.org.id,
    )
    db_session.add(address)
    db_session.commit()

    card = client.get(
        f"/api/addresses/{address.id}/full", headers=env.dispatcher.headers
    ).json()
    assert (card["district"], card["fias_id"]) == ("Невский р-н", "dddd")


def test_cache_is_thread_safe(monkeypatch):
    """Кэш дергают потоки пула: вытеснение и move_to_end не должны падать."""
    import threading

    monkeypatch.setattr(address_suggest, "_CACHE_MAX_ITEMS", 8)
    address_suggest.clear_cache()
    errors = []

    def worker(n):
        try:
            for i in range(2000):
                key = ("q", (n * 7 + i) % 32)
                address_suggest._cache_put(key, [i])
                address_suggest._cache_get(key)
                address_suggest._cache_get(("q", i % 32))
                if i % 500 == 0:
                    address_suggest.clear_cache()
        except Exception as exc:  # noqa: BLE001 — собираем для проверки
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert len(address_suggest._cache) <= 8
    address_suggest.clear_cache()
