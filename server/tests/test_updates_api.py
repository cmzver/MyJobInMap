"""
Tests for Updates API.
======================
Тесты API обновлений Android-приложения.
"""

import json
from unittest.mock import patch

import pytest

from app.api import updates as updates_api


@pytest.fixture(autouse=True)
def clean_apk_dir(tmp_path, monkeypatch):
    """Изолировать тесты обновлений от реального uploads/apk каталога."""
    apk_dir = tmp_path / "apk"
    metadata_file = apk_dir / "updates.json"

    monkeypatch.setattr(updates_api, "APK_DIR", apk_dir)
    monkeypatch.setattr(updates_api, "METADATA_FILE", metadata_file)

    apk_dir.mkdir(parents=True, exist_ok=True)
    yield


def _create_fake_apk(size: int = 1024) -> bytes:
    """Создать фейковый APK файл заданного размера."""
    return b"PK" + b"\x00" * (size - 2)


def _upload_apk(
    client,
    auth_headers,
    version_name="1.1.0",
    version_code=2,
    release_notes="Bug fixes",
    is_mandatory=False,
    apk_data=None,
    include_version_fields=True,
    extracted_version_name=None,
    extracted_version_code=None,
):
    """Хелпер для загрузки APK."""
    if apk_data is None:
        apk_data = _create_fake_apk()
    payload = {
        "release_notes": release_notes,
        "is_mandatory": str(is_mandatory).lower(),
    }
    if include_version_fields:
        payload["version_name"] = version_name
        payload["version_code"] = str(version_code)

    extracted_name = extracted_version_name or version_name
    extracted_code = extracted_version_code or version_code

    with patch(
        "app.api.updates.extract_apk_version_info",
        return_value=(extracted_name, extracted_code),
    ):
        return client.post(
            "/api/updates/upload",
            headers=auth_headers,
            files={
                "file": ("app.apk", apk_data, "application/vnd.android.package-archive")
            },
            data=payload,
        )


class TestCheckUpdate:
    """Тесты GET /api/updates/check"""

    def test_no_updates_available(self, client):
        """Нет обновлений — update_available=false"""
        response = client.get("/api/updates/check?version_code=1&version_name=1.0")
        assert response.status_code == 200
        data = response.json()
        assert data["update_available"] is False
        assert data["update"] is None

    def test_update_available(self, client, auth_headers):
        """Есть новая версия — update_available=true"""
        # Загружаем APK
        _upload_apk(client, auth_headers, version_name="2.0.0", version_code=5)

        # Проверяем с более старым version_code
        response = client.get("/api/updates/check?version_code=1&version_name=1.0")
        assert response.status_code == 200
        data = response.json()
        assert data["update_available"] is True
        assert data["update"]["version_name"] == "2.0.0"
        assert data["update"]["version_code"] == 5
        assert data["update"]["download_url"] == "/api/updates/download"

    def test_no_update_when_same_version(self, client, auth_headers):
        """Та же версия — update_available=false"""
        _upload_apk(client, auth_headers, version_code=5)

        response = client.get("/api/updates/check?version_code=5&version_name=1.1.0")
        assert response.status_code == 200
        assert response.json()["update_available"] is False

    def test_no_update_when_newer_version(self, client, auth_headers):
        """У клиента более новая версия — update_available=false"""
        _upload_apk(client, auth_headers, version_code=3)

        response = client.get("/api/updates/check?version_code=10&version_name=2.0.0")
        assert response.status_code == 200
        assert response.json()["update_available"] is False

    def test_check_returns_latest_version(self, client, auth_headers):
        """При нескольких версиях возвращается последняя"""
        _upload_apk(client, auth_headers, version_name="1.1.0", version_code=2)
        _upload_apk(client, auth_headers, version_name="1.2.0", version_code=3)
        _upload_apk(client, auth_headers, version_name="2.0.0", version_code=10)

        response = client.get("/api/updates/check?version_code=1&version_name=1.0")
        data = response.json()
        assert data["update_available"] is True
        assert data["update"]["version_code"] == 10
        assert data["update"]["version_name"] == "2.0.0"

    def test_check_without_auth(self, client, auth_headers):
        """Проверка обновлений не требует авторизации"""
        _upload_apk(client, auth_headers, version_code=5)

        # Запрос без токена
        response = client.get("/api/updates/check?version_code=1")
        assert response.status_code == 200
        assert response.json()["update_available"] is True

    def test_mandatory_flag_returned(self, client, auth_headers):
        """Флаг обязательного обновления возвращается"""
        _upload_apk(client, auth_headers, version_code=5, is_mandatory=True)

        response = client.get("/api/updates/check?version_code=1")
        data = response.json()
        assert data["update"]["is_mandatory"] is True


class TestUploadApk:
    """Тесты POST /api/updates/upload"""

    def test_upload_success(self, client, auth_headers):
        """Успешная загрузка APK"""
        response = _upload_apk(
            client,
            auth_headers,
            version_name="1.1.0",
            version_code=2,
            release_notes="New features",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["version_name"] == "1.1.0"
        assert data["version_code"] == 2
        assert data["release_notes"] == "New features"
        assert data["file_size"] == 1024
        assert data["download_url"] == "/api/updates/download"

    def test_upload_uses_version_extracted_from_apk(self, client, auth_headers):
        """Метаданные версии берутся из APK, а не из формы."""
        response = _upload_apk(
            client,
            auth_headers,
            version_name="1.0.0",
            version_code=1,
            include_version_fields=False,
            extracted_version_name="2.5.0",
            extracted_version_code=25,
        )

        assert response.status_code == 201
        data = response.json()
        assert data["version_name"] == "2.5.0"
        assert data["version_code"] == 25

    def test_upload_rejects_mismatched_form_version(self, client, auth_headers):
        """Ручные поля не должны расходиться с AndroidManifest.xml."""
        response = _upload_apk(
            client,
            auth_headers,
            version_name="1.0.0",
            version_code=1,
            extracted_version_name="2.0.0",
            extracted_version_code=2,
        )

        assert response.status_code == 400
        assert "AndroidManifest.xml" in response.json()["detail"]

    def test_upload_creates_file(self, client, auth_headers):
        """APK файл создаётся на диске"""
        _upload_apk(client, auth_headers, version_code=2)

        apk_path = updates_api.APK_DIR / "fieldworker-v2.apk"
        assert apk_path.exists()
        assert apk_path.stat().st_size == 1024

    def test_upload_requires_admin(self, client, client_with_dispatcher):
        """Загрузить APK может только администратор"""
        response = client_with_dispatcher.post(
            "/api/updates/upload",
            files={
                "file": (
                    "app.apk",
                    _create_fake_apk(),
                    "application/vnd.android.package-archive",
                )
            },
            data={"version_name": "1.0.0", "version_code": "1"},
        )
        assert response.status_code == 403

    def test_upload_requires_auth(self, client):
        """Загрузка без авторизации — 401"""
        response = client.post(
            "/api/updates/upload",
            files={
                "file": (
                    "app.apk",
                    _create_fake_apk(),
                    "application/vnd.android.package-archive",
                )
            },
            data={"version_name": "1.0.0", "version_code": "1"},
        )
        assert response.status_code == 401

    def test_upload_non_apk_rejected(self, client, auth_headers):
        """Файл не .apk отклоняется"""
        response = client.post(
            "/api/updates/upload",
            headers=auth_headers,
            files={"file": ("doc.pdf", b"PDF content", "application/pdf")},
            data={"version_name": "1.0.0", "version_code": "1"},
        )
        assert response.status_code == 400
        assert "apk" in response.json()["detail"].lower()

    def test_upload_empty_file_rejected(self, client, auth_headers):
        """Пустой файл отклоняется"""
        response = client.post(
            "/api/updates/upload",
            headers=auth_headers,
            files={"file": ("app.apk", b"", "application/vnd.android.package-archive")},
            data={"version_name": "1.0.0", "version_code": "1"},
        )
        assert response.status_code == 400

    def test_upload_duplicate_version_code_rejected(self, client, auth_headers):
        """Дублирующийся version_code отклоняется"""
        _upload_apk(client, auth_headers, version_code=5)

        response = _upload_apk(
            client, auth_headers, version_code=5, version_name="1.2.0"
        )
        assert response.status_code == 409

    def test_upload_lower_than_latest_version_code_rejected(self, client, auth_headers):
        """version_code должен расти монотонно"""
        _upload_apk(client, auth_headers, version_name="2.0.0", version_code=10)

        response = _upload_apk(
            client, auth_headers, version_name="2.1.0", version_code=9
        )
        assert response.status_code == 409
        assert "version_code" in response.json()["detail"]


class TestDownloadApk:
    """Тесты GET /api/updates/download"""

    def test_download_latest(self, client, auth_headers):
        """Скачивание последнего APK"""
        apk_data = _create_fake_apk(2048)
        _upload_apk(client, auth_headers, version_code=2, apk_data=apk_data)

        response = client.get("/api/updates/download")
        assert response.status_code == 200
        assert len(response.content) == 2048
        assert "application/vnd.android.package-archive" in response.headers.get(
            "content-type", ""
        )

    def test_download_no_updates(self, client):
        """Скачивание когда нет обновлений — 404"""
        response = client.get("/api/updates/download")
        assert response.status_code == 404

    def test_download_without_auth(self, client, auth_headers):
        """Скачивание не требует авторизации"""
        _upload_apk(client, auth_headers, version_code=2)

        # Запрос без токена
        response = client.get("/api/updates/download")
        assert response.status_code == 200


class TestUpdateHistory:
    """Тесты GET /api/updates/history"""

    def test_empty_history(self, client, auth_headers):
        """Пустая история"""
        response = client.get("/api/updates/history", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    def test_history_with_versions(self, client, auth_headers):
        """История с несколькими версиями, отсортированная по убыванию"""
        _upload_apk(client, auth_headers, version_name="1.0.0", version_code=1)
        _upload_apk(client, auth_headers, version_name="1.1.0", version_code=2)
        _upload_apk(client, auth_headers, version_name="2.0.0", version_code=10)

        response = client.get("/api/updates/history", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        # Первая — самая новая
        assert data[0]["version_code"] == 10
        assert data[1]["version_code"] == 2
        assert data[2]["version_code"] == 1

    def test_history_requires_admin(self, client, client_with_dispatcher):
        """История требует прав администратора"""
        response = client_with_dispatcher.get("/api/updates/history")
        assert response.status_code == 403


class TestDeleteUpdate:
    """Тесты DELETE /api/updates/{version_code}"""

    def test_delete_version(self, client, auth_headers):
        """Успешное удаление версии"""
        _upload_apk(client, auth_headers, version_code=5)

        response = client.delete("/api/updates/5", headers=auth_headers)
        assert response.status_code == 204

        # Проверяем что файл удалён
        assert not (updates_api.APK_DIR / "fieldworker-v5.apk").exists()

        # Проверяем что записи нет
        records = updates_api._load_metadata()
        assert len(records) == 0

    def test_delete_nonexistent(self, client, auth_headers):
        """Удаление несуществующей версии — 404"""
        response = client.delete("/api/updates/999", headers=auth_headers)
        assert response.status_code == 404

    def test_delete_requires_admin(self, client, auth_headers, client_with_dispatcher):
        """Удаление требует прав администратора"""
        _upload_apk(client, auth_headers, version_code=5)

        response = client_with_dispatcher.delete("/api/updates/5")
        assert response.status_code == 403

    def test_delete_preserves_other_versions(self, client, auth_headers):
        """Удаление одной версии не затрагивает другие"""
        _upload_apk(client, auth_headers, version_name="1.0.0", version_code=1)
        _upload_apk(client, auth_headers, version_name="2.0.0", version_code=2)

        client.delete("/api/updates/1", headers=auth_headers)

        records = updates_api._load_metadata()
        assert len(records) == 1
        assert records[0]["version_code"] == 2
