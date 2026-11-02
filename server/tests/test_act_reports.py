"""Фаза 4d: деньги по актам, выгрузки Excel/ZIP, материалы → оборудование адреса."""

import io
import zipfile

from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.models import (
    ActLineModel,
    AddressEquipmentModel,
    AddressHistoryModel,
    AddressModel,
    CommentModel,
)
from tests.test_acts import _act, _org


def _with_address(db_session, env):
    address = AddressModel(
        address="Санкт-Петербург, ул. Невская, д. 9",
        organization_id=env.org.id,
        lat=59.9,
        lon=30.3,
    )
    db_session.add(address)
    db_session.commit()
    env.task.address_id = address.id
    db_session.commit()
    return address


class TestSummary:
    def test_money_by_method_and_worker_without_cancelled(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "MoneyOrg")
        headers = env.dispatcher.headers
        cash = _act(
            client,
            headers,
            env.task.id,
            lines=[{"name": "Замена трубки", "price": 1500}],
            payment_method="cash",
        )
        assert cash.status_code == 201, cash.text
        card = _act(
            client,
            headers,
            env.task.id,
            lines=[{"name": "Ключ", "price": 300, "qty": 2}],
            payment_method="card",
        )
        assert card.status_code == 201, card.text
        cancelled = _act(client, headers, env.task.id, payment_method="cash")
        client.post(
            f"/api/acts/{cancelled.json()['id']}/cancel",
            json={"reason": "Ошибка в сумме"},
            headers=headers,
        )

        response = client.get("/api/acts/summary", headers=headers)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["issued"] == 2
        assert data["pending"] == 2
        assert data["total"] == 2100
        methods = {row["method"]: row for row in data["by_method"]}
        assert methods["cash"] == {"method": "cash", "count": 1, "amount": 1500}
        assert methods["card"]["amount"] == 600
        [worker] = data["workers"]
        assert worker["acts"] == 2
        assert worker["cash"] == 1500
        assert worker["card"] == 600

    def test_isolated_between_organizations(self, client: TestClient, db_session):
        own = _org(client, db_session, "SumOwn")
        other = _org(client, db_session, "SumOther")
        _act(client, own.dispatcher.headers, own.task.id, payment_method="cash")

        data = client.get("/api/acts/summary", headers=other.dispatcher.headers).json()
        assert data["issued"] == 0
        assert data["workers"] == []


class TestExports:
    def test_excel_registry_has_acts_and_lines(self, client: TestClient, db_session):
        env = _org(client, db_session, "XlsxOrg")
        act = _act(
            client,
            env.dispatcher.headers,
            env.task.id,
            lines=[{"name": "Замена трубки", "price": 1500}],
            payment_method="cash",
        ).json()

        response = client.get("/api/acts/export.xlsx", headers=env.dispatcher.headers)
        assert response.status_code == 200, response.text
        assert "attachment" in response.headers["content-disposition"]
        book = load_workbook(io.BytesIO(response.content))
        acts = book["Акты"]
        assert acts.cell(row=2, column=1).value == act["number"]
        assert acts.cell(row=2, column=9).value == "Наличные"
        assert acts.cell(row=2, column=10).value == 1500
        assert book["Строки"].cell(row=2, column=3).value == "Замена трубки"

    def test_month_archive_has_pdfs_and_registry(self, client: TestClient, db_session):
        env = _org(client, db_session, "ZipOrg")
        act = _act(client, env.dispatcher.headers, env.task.id).json()
        cancelled = _act(client, env.dispatcher.headers, env.task.id).json()
        client.post(
            f"/api/acts/{cancelled['id']}/cancel",
            json={"reason": "Дубль"},
            headers=env.dispatcher.headers,
        )
        month = act["created_at"][:7]

        response = client.get(
            f"/api/acts/archive.zip?month={month}", headers=env.dispatcher.headers
        )
        assert response.status_code == 200, response.text
        names = zipfile.ZipFile(io.BytesIO(response.content)).namelist()
        assert f"{act['number'].replace('/', '-')}.pdf" in names
        assert f"{cancelled['number'].replace('/', '-')}.pdf" not in names
        assert "Реестр актов.xlsx" in names

    def test_archive_month_is_validated(self, client: TestClient, db_session):
        env = _org(client, db_session, "ZipBad")
        response = client.get(
            "/api/acts/archive.zip?month=2026-13", headers=env.dispatcher.headers
        )
        assert response.status_code == 422


class TestInstallToObject:
    def test_installed_material_becomes_address_equipment(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "InstOrg")
        address = _with_address(db_session, env)
        response = _act(
            client,
            env.dispatcher.headers,
            env.task.id,
            lines=[
                {"name": "Работа", "price": 500},
                {
                    "name": "Трубка УКП-12М",
                    "line_type": "material",
                    "price": 1290,
                    "serial_number": "SN-777",
                    "install_to_object": True,
                },
                {"name": "Стяжки", "line_type": "material", "price": 10},
            ],
        )
        assert response.status_code == 201, response.text
        act = response.json()

        equipment = (
            db_session.query(AddressEquipmentModel)
            .filter_by(address_id=address.id)
            .all()
        )
        assert [(e.name, e.serial_number) for e in equipment] == [
            ("Трубка УКП-12М", "SN-777")
        ]
        assert act["number"] in equipment[0].notes
        installed = [line for line in act["lines"] if line["install_to_object"]]
        assert [line["equipment_id"] for line in installed] == [equipment[0].id]
        history = db_session.query(AddressHistoryModel).filter_by(address_id=address.id)
        assert history.count() == 1
        comment = (
            db_session.query(CommentModel)
            .filter_by(task_id=env.task.id)
            .order_by(CommentModel.id.desc())
            .first()
        )
        assert "На объект установлено: Трубка УКП-12М" in comment.text

    def test_work_line_flag_and_task_without_address_install_nothing(
        self, client: TestClient, db_session
    ):
        env = _org(client, db_session, "InstNone")
        response = _act(
            client,
            env.dispatcher.headers,
            env.task.id,
            lines=[
                {"name": "Работа", "price": 500, "install_to_object": True},
                {
                    "name": "Трубка",
                    "line_type": "material",
                    "price": 100,
                    "install_to_object": True,
                },
            ],
        )
        assert response.status_code == 201, response.text
        assert db_session.query(AddressEquipmentModel).count() == 0
        flags = [
            line.install_to_object
            for line in db_session.query(ActLineModel).order_by(ActLineModel.position)
        ]
        # Флаг у работы не ставится; у материала стоит, но без объекта не заводит
        assert flags == [False, True]


class TestAddressFilter:
    def test_acts_by_address(self, client: TestClient, db_session):
        env = _org(client, db_session, "AddrActs")
        address = _with_address(db_session, env)
        act = _act(client, env.dispatcher.headers, env.task.id).json()

        found = client.get(
            f"/api/acts?address_id={address.id}", headers=env.dispatcher.headers
        ).json()
        assert [item["id"] for item in found["items"]] == [act["id"]]
        empty = client.get(
            f"/api/acts?address_id={address.id + 999}", headers=env.dispatcher.headers
        ).json()
        assert empty["total"] == 0
