"""
Tests for Address Extended API
==============================
Тесты для расширенной карточки объекта.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AddressModel, AddressSystemModel, AddressEquipmentModel, AddressContactModel


class TestAddressFullEndpoint:
    """Тесты получения полной карточки объекта."""
    
    def test_get_address_full(self, client: TestClient, db_session: Session, auth_headers: dict):
        """Получение полной информации об объекте."""
        # Создаём адрес
        address = AddressModel(
            address="Тестовая ул., 1",
            city="Тест",
            entrance_count=4,
            floor_count=9
        )
        db_session.add(address)
        db_session.commit()
        db_session.refresh(address)
        
        # Создаём систему
        system = AddressSystemModel(
            address_id=address.id,
            system_type="video_surveillance",
            name="Видеонаблюдение",
            status="active"
        )
        db_session.add(system)
        db_session.commit()
        
        # Запрашиваем полную карточку
        response = client.get(
            f"/api/addresses/{address.id}/full",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["id"] == address.id
        assert data["address"] == "Тестовая ул., 1"
        assert "systems" in data
        assert "equipment" in data
        assert "documents" in data
        assert "contacts" in data
        assert "task_stats" in data
        
        # Проверяем систему
        assert len(data["systems"]) == 1
        assert data["systems"][0]["name"] == "Видеонаблюдение"
    
    def test_get_address_full_not_found(self, client: TestClient, auth_headers: dict):
        """404 для несуществующего адреса."""
        response = client.get("/api/addresses/99999/full", headers=auth_headers)
        assert response.status_code == 404


class TestAddressSystemsCRUD:
    """Тесты CRUD для систем."""
    
    @pytest.fixture
    def address(self, db_session: Session) -> AddressModel:
        """Создаём тестовый адрес."""
        address = AddressModel(address="Тестовый проспект, 10")
        db_session.add(address)
        db_session.commit()
        db_session.refresh(address)
        return address
    
    def test_create_system(self, client: TestClient, address: AddressModel, auth_headers: dict):
        """Создание системы."""
        data = {
            "system_type": "intercom",
            "name": "Домофония Vizit",
            "status": "active",
            "monthly_cost": 3000
        }
        response = client.post(
            f"/api/addresses/{address.id}/systems",
            json=data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "Домофония Vizit"
        assert result["system_type"] == "intercom"
        assert result["monthly_cost"] == 3000
    
    def test_get_systems(self, client: TestClient, address: AddressModel, db_session: Session, auth_headers: dict):
        """Получение списка систем."""
        # Создаём системы
        system1 = AddressSystemModel(address_id=address.id, system_type="video_surveillance", name="Видео", status="active")
        system2 = AddressSystemModel(address_id=address.id, system_type="intercom", name="Домофон", status="active")
        db_session.add_all([system1, system2])
        db_session.commit()
        
        response = client.get(f"/api/addresses/{address.id}/systems", headers=auth_headers)
        
        assert response.status_code == 200
        systems = response.json()
        assert len(systems) == 2
    
    def test_update_system(self, client: TestClient, address: AddressModel, db_session: Session, auth_headers: dict):
        """Обновление системы."""
        system = AddressSystemModel(
            address_id=address.id, 
            system_type="video_surveillance", 
            name="Видео", 
            status="active"
        )
        db_session.add(system)
        db_session.commit()
        db_session.refresh(system)
        
        response = client.put(
            f"/api/addresses/{address.id}/systems/{system.id}",
            json={"status": "maintenance", "notes": "На профилактике"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "maintenance"
        assert result["notes"] == "На профилактике"
    
    def test_delete_system(self, client: TestClient, address: AddressModel, db_session: Session, auth_headers: dict):
        """Удаление системы."""
        system = AddressSystemModel(address_id=address.id, system_type="fire_alarm", name="ОПС", status="active")
        db_session.add(system)
        db_session.commit()
        db_session.refresh(system)
        
        response = client.delete(f"/api/addresses/{address.id}/systems/{system.id}", headers=auth_headers)
        assert response.status_code == 204
        
        # Проверяем, что удалена
        check = db_session.query(AddressSystemModel).filter(AddressSystemModel.id == system.id).first()
        assert check is None


class TestAddressEquipmentCRUD:
    """Тесты CRUD для оборудования."""
    
    @pytest.fixture
    def address_with_system(self, db_session: Session):
        """Создаём адрес с системой."""
        address = AddressModel(address="Оборудовательная ул., 5")
        db_session.add(address)
        db_session.commit()
        db_session.refresh(address)
        
        system = AddressSystemModel(address_id=address.id, system_type="video_surveillance", name="Видео", status="active")
        db_session.add(system)
        db_session.commit()
        db_session.refresh(system)
        
        return address, system
    
    def test_create_equipment(self, client: TestClient, address_with_system, auth_headers: dict):
        """Создание оборудования."""
        address, system = address_with_system
        
        data = {
            "equipment_type": "camera",
            "name": "IP-камера Hikvision",
            "model": "DS-2CD2143G2-I",
            "quantity": 4,
            "system_id": system.id,
            "status": "working"
        }
        response = client.post(
            f"/api/addresses/{address.id}/equipment",
            json=data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "IP-камера Hikvision"
        assert result["quantity"] == 4
        assert result["system_id"] == system.id
    
    def test_get_equipment_filtered_by_system(self, client: TestClient, address_with_system, db_session: Session, auth_headers: dict):
        """Фильтрация оборудования по системе."""
        address, system = address_with_system
        
        # Оборудование с системой
        eq1 = AddressEquipmentModel(address_id=address.id, system_id=system.id, equipment_type="camera", name="Камера", status="working")
        # Оборудование без системы
        eq2 = AddressEquipmentModel(address_id=address.id, system_id=None, equipment_type="ups", name="ИБП", status="working")
        db_session.add_all([eq1, eq2])
        db_session.commit()
        
        # Все
        response = client.get(f"/api/addresses/{address.id}/equipment", headers=auth_headers)
        assert len(response.json()) == 2
        
        # Только по системе
        response = client.get(f"/api/addresses/{address.id}/equipment?system_id={system.id}", headers=auth_headers)
        assert len(response.json()) == 1
        assert response.json()[0]["name"] == "Камера"


class TestAddressContactsCRUD:
    """Тесты CRUD для контактов."""
    
    @pytest.fixture
    def address(self, db_session: Session) -> AddressModel:
        """Создаём тестовый адрес."""
        address = AddressModel(address="Контактная ул., 15")
        db_session.add(address)
        db_session.commit()
        db_session.refresh(address)
        return address
    
    def test_create_contact(self, client: TestClient, address: AddressModel, auth_headers: dict):
        """Создание контакта."""
        data = {
            "contact_type": "chairman",
            "name": "Иванов Иван",
            "phone": "+7 (999) 123-45-67",
            "is_primary": True
        }
        response = client.post(
            f"/api/addresses/{address.id}/contacts",
            json=data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        result = response.json()
        assert result["name"] == "Иванов Иван"
        assert result["contact_type"] == "chairman"
        assert result["is_primary"] == True
    
    def test_update_contact(self, client: TestClient, address: AddressModel, db_session: Session, auth_headers: dict):
        """Обновление контакта."""
        contact = AddressContactModel(
            address_id=address.id,
            contact_type="concierge",
            name="Старый консьерж",
            is_primary=False
        )
        db_session.add(contact)
        db_session.commit()
        db_session.refresh(contact)
        
        response = client.put(
            f"/api/addresses/{address.id}/contacts/{contact.id}",
            json={"name": "Новый консьерж", "phone": "+7 (999) 000-00-00"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "Новый консьерж"
        assert result["phone"] == "+7 (999) 000-00-00"


class TestAddressHistory:
    """Тесты истории объекта."""
    
    def test_history_created_on_system_add(self, client: TestClient, db_session: Session, auth_headers: dict):
        """Проверяем, что при добавлении системы создаётся запись в истории."""
        address = AddressModel(address="Историческая ул., 1")
        db_session.add(address)
        db_session.commit()
        db_session.refresh(address)
        
        # Добавляем систему
        client.post(
            f"/api/addresses/{address.id}/systems",
            json={"system_type": "intercom", "name": "Домофон", "status": "active"},
            headers=auth_headers
        )
        
        # Проверяем историю
        response = client.get(f"/api/addresses/{address.id}/history", headers=auth_headers)
        assert response.status_code == 200
        history = response.json()
        
        assert len(history) >= 1
        assert any(h["event_type"] == "system_added" for h in history)
