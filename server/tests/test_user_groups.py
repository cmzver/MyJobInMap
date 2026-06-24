"""Тесты групп пользователей (кастомных ролей) с изоляцией по организациям."""

from app.models import OrganizationModel, UserModel
from app.services.auth import check_permission
from app.services.role_utils import is_dispatcher_or_admin_user, is_worker_user
from app.services.tenant_service import TenantService


def _mk_org(db, name):
    org = OrganizationModel(name=name, slug=name.lower())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _org_admin(client, db, org_name, username):
    """Создать организацию с орг-админом и вернуть (org, auth_headers админа)."""
    org, _admin = TenantService(db).create_with_admin(
        org_name,
        {"username": username, "password": "secret12", "full_name": "Org Admin"},
    )
    resp = client.post(
        "/api/auth/login", data={"username": username, "password": "secret12"}
    )
    assert resp.status_code == 200, resp.text
    return org, {"Authorization": f"Bearer {resp.json()['access_token']}"}


class TestPerOrgIsolation:
    def test_same_name_groups_have_independent_permissions(
        self, client, auth_headers, db_session
    ):
        org_a = _mk_org(db_session, "OrgA")
        org_b = _mk_org(db_session, "OrgB")

        ra = client.post(
            f"/api/admin/groups?organization_id={org_a.id}",
            json={"name": "accountant", "label": "Бух A", "base_access": "dispatcher"},
            headers=auth_headers,
        )
        assert ra.status_code == 201, ra.text
        rb = client.post(
            f"/api/admin/groups?organization_id={org_b.id}",
            json={"name": "accountant", "label": "Бух B", "base_access": "worker"},
            headers=auth_headers,
        )
        assert rb.status_code == 201, rb.text

        # Право view_users включаем только группе org A
        client.patch(
            f"/api/admin/permissions/accountant?organization_id={org_a.id}",
            json={"permissions": {"view_users": True}},
            headers=auth_headers,
        )

        ua = UserModel(
            username="ua",
            password_hash="x",
            role="accountant",
            organization_id=org_a.id,
        )
        ub = UserModel(
            username="ub",
            password_hash="x",
            role="accountant",
            organization_id=org_b.id,
        )
        db_session.add_all([ua, ub])
        db_session.commit()
        db_session.refresh(ua)
        db_session.refresh(ub)

        assert check_permission(db_session, ua, "view_users") is True
        assert check_permission(db_session, ub, "view_users") is False

    def test_list_groups_scoped_to_org(self, client, auth_headers, db_session):
        org_a = _mk_org(db_session, "OrgList A")
        org_b = _mk_org(db_session, "OrgList B")
        client.post(
            f"/api/admin/groups?organization_id={org_a.id}",
            json={"name": "agent_a", "label": "A", "base_access": "worker"},
            headers=auth_headers,
        )
        client.post(
            f"/api/admin/groups?organization_id={org_b.id}",
            json={"name": "agent_b", "label": "B", "base_access": "worker"},
            headers=auth_headers,
        )
        names_a = {
            g["name"]
            for g in client.get(
                f"/api/admin/groups?organization_id={org_a.id}", headers=auth_headers
            ).json()
        }
        assert "agent_a" in names_a
        assert "agent_b" not in names_a
        # Встроенные видны в любом скоупе
        assert {"admin", "dispatcher", "worker"} <= names_a


class TestOrgAdminSelfService:
    def test_org_admin_manages_own_groups(self, client, db_session):
        org, headers = _org_admin(client, db_session, "SelfOrg", "selfadmin")
        # Орг-админ создаёт группу без указания org → своя организация
        resp = client.post(
            "/api/admin/groups",
            json={"name": "courier", "label": "Курьер", "base_access": "worker"},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text
        group = client.get("/api/admin/groups", headers=headers).json()
        assert any(g["name"] == "courier" for g in group)

    def test_org_admin_cannot_see_other_org_groups(
        self, client, auth_headers, db_session
    ):
        other = _mk_org(db_session, "OtherOrg")
        client.post(
            f"/api/admin/groups?organization_id={other.id}",
            json={"name": "secret", "label": "S", "base_access": "worker"},
            headers=auth_headers,
        )
        _org, headers = _org_admin(client, db_session, "MyOrg", "myadmin")
        names = {
            g["name"] for g in client.get("/api/admin/groups", headers=headers).json()
        }
        assert "secret" not in names

    def test_org_admin_cannot_edit_builtin_permissions(self, client, db_session):
        _org, headers = _org_admin(client, db_session, "NoBuiltinEdit", "nbeadmin")
        resp = client.patch(
            "/api/admin/permissions/worker",
            json={"permissions": {"view_tasks": False}},
            headers=headers,
        )
        assert resp.status_code == 403


class TestGroupCrudRules:
    def test_superadmin_create_without_org_rejected(self, client, auth_headers):
        resp = client.post(
            "/api/admin/groups",
            json={"name": "nogorg", "label": "X", "base_access": "worker"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_create_rejects_admin_base_access(self, client, auth_headers, db_session):
        org = _mk_org(db_session, "BaseOrg")
        resp = client.post(
            f"/api/admin/groups?organization_id={org.id}",
            json={"name": "super", "label": "S", "base_access": "admin"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_rename_is_scoped_to_org(self, client, auth_headers, db_session):
        org_a = _mk_org(db_session, "RenameA")
        org_b = _mk_org(db_session, "RenameB")
        for org in (org_a, org_b):
            client.post(
                f"/api/admin/groups?organization_id={org.id}",
                json={"name": "old", "label": "Old", "base_access": "worker"},
                headers=auth_headers,
            )
        db_session.add(
            UserModel(
                username="ru",
                password_hash="x",
                role="old",
                organization_id=org_a.id,
            )
        )
        db_session.add(
            UserModel(
                username="rb",
                password_hash="x",
                role="old",
                organization_id=org_b.id,
            )
        )
        db_session.commit()

        resp = client.patch(
            f"/api/admin/groups/old?organization_id={org_a.id}",
            json={"name": "renamed"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

        ua = db_session.query(UserModel).filter_by(username="ru").first()
        ub = db_session.query(UserModel).filter_by(username="rb").first()
        db_session.refresh(ua)
        db_session.refresh(ub)
        assert ua.role == "renamed"
        assert ub.role == "old"  # org B не затронут

    def test_cannot_delete_builtin(self, client, auth_headers, db_session):
        org = _mk_org(db_session, "DelBuiltin")
        resp = client.delete(
            f"/api/admin/groups/worker?organization_id={org.id}", headers=auth_headers
        )
        assert resp.status_code in (403, 404)

    def test_delete_in_use_rejected(self, client, auth_headers, db_session):
        org = _mk_org(db_session, "InUseOrg")
        client.post(
            f"/api/admin/groups?organization_id={org.id}",
            json={"name": "inuse", "label": "U", "base_access": "worker"},
            headers=auth_headers,
        )
        db_session.add(
            UserModel(
                username="iu",
                password_hash="x",
                role="inuse",
                organization_id=org.id,
            )
        )
        db_session.commit()
        resp = client.delete(
            f"/api/admin/groups/inuse?organization_id={org.id}", headers=auth_headers
        )
        assert resp.status_code == 400


class TestCustomGroupAccessScoping:
    def test_custom_dispatcher_passes_gate_worker_does_not(
        self, client, auth_headers, db_session
    ):
        org = _mk_org(db_session, "GateOrg")
        client.post(
            f"/api/admin/groups?organization_id={org.id}",
            json={"name": "coord", "label": "Коорд", "base_access": "dispatcher"},
            headers=auth_headers,
        )
        client.post(
            f"/api/admin/groups?organization_id={org.id}",
            json={"name": "field", "label": "Поле", "base_access": "worker"},
            headers=auth_headers,
        )
        coord = UserModel(
            username="coord1",
            password_hash="x",
            role="coord",
            organization_id=org.id,
        )
        field = UserModel(
            username="field1",
            password_hash="x",
            role="field",
            organization_id=org.id,
        )
        db_session.add_all([coord, field])
        db_session.commit()
        db_session.refresh(coord)
        db_session.refresh(field)

        assert is_dispatcher_or_admin_user(coord) is True
        assert is_worker_user(coord) is False
        assert is_worker_user(field) is True
        assert is_dispatcher_or_admin_user(field) is False

    def test_create_user_with_unknown_role_rejected(
        self, client, auth_headers, db_session
    ):
        org = _mk_org(db_session, "UnknownRoleOrg")
        resp = client.post(
            "/api/admin/users",
            json={
                "username": "ghostuser",
                "password": "secret12",
                "role": "ghost",
                "organization_id": org.id,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400
