"""Tests for endpoints that must remain available only to superadmins."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.models import OrganizationModel, UserModel, UserRole
from app.services.auth import get_password_hash


def _login_headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        data={"username": username, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_org_admin(db_session, username: str = "orgadmin", password: str = "pass123") -> UserModel:
    org = OrganizationModel(name=f"Org for {username}", slug=f"org-{username}")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    user = UserModel(
        username=username,
        password_hash=get_password_hash(password),
        full_name=username,
        role=UserRole.ADMIN.value,
        is_active=True,
        organization_id=org.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_org_admin_cannot_access_system_admin_endpoints(client: TestClient, db_session):
    user = _create_org_admin(db_session)
    headers = _login_headers(client, user.username, "pass123")

    protected_endpoints = [
        ("get", "/api/admin/devices"),
        ("get", "/api/admin/permissions"),
        ("get", "/api/admin/settings"),
        ("get", "/api/updates/history"),
    ]

    for method, url in protected_endpoints:
        response = getattr(client, method)(url, headers=headers)
        assert response.status_code == 403, f"{url} should be forbidden for org-admin"


def test_org_admin_cannot_modify_global_custom_fields(client: TestClient, db_session):
    user = _create_org_admin(db_session, username="orgadmin_fields")
    headers = _login_headers(client, user.username, "pass123")

    response = client.post(
        "/api/admin/custom-fields",
        json={
            "name": "building_code",
            "label": "Код дома",
            "field_type": "text",
            "required": False,
            "show_in_list": False,
            "show_in_card": True,
            "order": 1,
        },
        headers=headers,
    )
    assert response.status_code == 403


def test_org_admin_cannot_upload_apk(client: TestClient, db_session):
    user = _create_org_admin(db_session, username="orgadmin_updates")
    headers = _login_headers(client, user.username, "pass123")

    with patch(
        "app.api.updates.extract_apk_version_info",
        return_value=("1.0.0", 1),
    ):
        response = client.post(
            "/api/updates/upload",
            headers=headers,
            files={"file": ("app.apk", b"PK" + b"\x00" * 1022, "application/vnd.android.package-archive")},
            data={"version_name": "1.0.0", "version_code": "1"},
        )

    assert response.status_code == 403