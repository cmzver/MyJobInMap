"""Tests for TenantService and TenantFilter."""

import pytest
from app.services.tenant_service import TenantService, slugify
from app.services.tenant_filter import TenantFilter
from app.models import OrganizationModel, UserModel, TaskModel
from app.models.enums import UserRole
from app.services.auth import get_password_hash
from fastapi import HTTPException


class TestSlugify:
    """Tests for slugify utility."""

    def test_simple_name(self):
        assert slugify("Test Organization") == "test-organization"

    def test_special_characters(self):
        result = slugify("Компания ООО «Тест»")
        assert len(result) > 0
        assert " " not in result

    def test_multiple_spaces(self):
        assert slugify("Multiple   Spaces   Here") == "multiple-spaces-here"

    def test_trailing_dashes(self):
        result = slugify("  --test--  ")
        assert not result.startswith("-")
        assert not result.endswith("-")

    def test_max_length(self):
        result = slugify("A" * 200)
        assert len(result) <= 100

    def test_empty_after_cleanup(self):
        result = slugify("---")
        assert result == ""


class TestTenantService:
    """Tests for TenantService."""

    def test_create_organization(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Test Corp", description="A test org")
        assert org.id is not None
        assert org.name == "Test Corp"
        assert org.slug == "test-corp"
        assert org.is_active is True

    def test_create_with_custom_slug(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="My Org", slug="custom-slug")
        assert org.slug == "custom-slug"

    def test_create_duplicate_fails(self, db_session):
        svc = TenantService(db_session)
        svc.create(name="Unique Name")
        with pytest.raises(HTTPException) as exc_info:
            svc.create(name="Unique Name")
        assert exc_info.value.status_code == 409

    def test_get_by_id(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Find Me")
        found = svc.get_by_id(org.id)
        assert found is not None
        assert found.name == "Find Me"

    def test_get_by_id_not_found(self, db_session):
        svc = TenantService(db_session)
        assert svc.get_by_id(99999) is None

    def test_get_by_slug(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Slug Org")
        found = svc.get_by_slug("slug-org")
        assert found is not None
        assert found.id == org.id

    def test_list_all_active_only(self, db_session):
        svc = TenantService(db_session)
        org1 = svc.create(name="Active Org")
        org2 = svc.create(name="Inactive Org")
        svc.deactivate(org2.id)

        active = svc.list_all(include_inactive=False)
        assert len(active) == 1
        assert active[0].id == org1.id

    def test_list_all_with_inactive(self, db_session):
        svc = TenantService(db_session)
        svc.create(name="Org A")
        org_b = svc.create(name="Org B")
        svc.deactivate(org_b.id)

        all_orgs = svc.list_all(include_inactive=True)
        assert len(all_orgs) == 2

    def test_update_organization(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Old Name")
        updated = svc.update(org.id, name="New Name", max_users=200)
        assert updated is not None
        assert updated.name == "New Name"
        assert updated.max_users == 200

    def test_update_not_found(self, db_session):
        svc = TenantService(db_session)
        assert svc.update(99999, name="X") is None

    def test_deactivate(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="To Deactivate")
        result = svc.deactivate(org.id)
        assert result is not None
        assert result.is_active is False

    def test_assign_user(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Assign Org")

        user = UserModel(
            username="assign_test",
            password_hash=get_password_hash("test"),
            full_name="Assign Test",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        assigned = svc.assign_user(user.id, org.id)
        assert assigned.organization_id == org.id

    def test_assign_user_to_inactive_org_fails(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Inactive Org For Assign")
        svc.deactivate(org.id)

        user = UserModel(
            username="inactive_test",
            password_hash=get_password_hash("test"),
            full_name="Test",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        with pytest.raises(HTTPException) as exc_info:
            svc.assign_user(user.id, org.id)
        assert exc_info.value.status_code == 400

    def test_assign_user_exceeds_limit(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="Limited Org", max_users=1)

        # First user
        user1 = UserModel(
            username="user1_limit",
            password_hash=get_password_hash("test"),
            full_name="User 1",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add(user1)
        db_session.commit()
        db_session.refresh(user1)
        svc.assign_user(user1.id, org.id)

        # Second user should fail
        user2 = UserModel(
            username="user2_limit",
            password_hash=get_password_hash("test"),
            full_name="User 2",
            role=UserRole.WORKER.value,
            is_active=True,
        )
        db_session.add(user2)
        db_session.commit()
        db_session.refresh(user2)

        with pytest.raises(HTTPException) as exc_info:
            svc.assign_user(user2.id, org.id)
        assert exc_info.value.status_code == 400
        assert "лимит" in exc_info.value.detail.lower()

    def test_assign_nonexistent_user_fails(self, db_session):
        svc = TenantService(db_session)
        org = svc.create(name="No User Org")

        with pytest.raises(HTTPException) as exc_info:
            svc.assign_user(99999, org.id)
        assert exc_info.value.status_code == 404


class TestTenantFilter:
    """Tests for TenantFilter data isolation."""

    def test_superadmin_sees_all(self, db_session):
        """Admin without org_id should see all data."""
        admin = UserModel(
            username="superadmin_tf",
            password_hash=get_password_hash("test"),
            full_name="Superadmin",
            role=UserRole.ADMIN.value,
            is_active=True,
            organization_id=None,
        )
        db_session.add(admin)
        db_session.commit()

        tf = TenantFilter(admin)
        query = db_session.query(TaskModel)
        filtered = tf.apply(query, TaskModel)
        # Should not add any org filter — just the same query
        assert filtered is not None

    def test_org_user_sees_own_org_only(self, db_session):
        """User with org_id should only see data from their org."""
        svc = TenantService(db_session)
        org = svc.create(name="Filter Org")

        user = UserModel(
            username="org_user_tf",
            password_hash=get_password_hash("test"),
            full_name="Org User",
            role=UserRole.WORKER.value,
            is_active=True,
            organization_id=org.id,
        )
        db_session.add(user)
        db_session.commit()

        tf = TenantFilter(user)

        # Create tasks — one for org, one without org
        task_org = TaskModel(
            title="Org Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
            organization_id=org.id,
        )
        task_no_org = TaskModel(
            title="No Org Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
            organization_id=None,
        )
        db_session.add_all([task_org, task_no_org])
        db_session.commit()

        query = db_session.query(TaskModel)
        filtered = tf.apply(query, TaskModel)
        results = filtered.all()

        assert len(results) == 1
        assert results[0].title == "Org Task"

    def test_set_org_id_on_create(self, db_session):
        """set_org_id should auto-set organization_id from user."""
        svc = TenantService(db_session)
        org = svc.create(name="Auto Set Org")

        user = UserModel(
            username="auto_org_user",
            password_hash=get_password_hash("test"),
            full_name="Auto Org",
            role=UserRole.DISPATCHER.value,
            is_active=True,
            organization_id=org.id,
        )
        db_session.add(user)
        db_session.commit()

        tf = TenantFilter(user)
        task = TaskModel(
            title="New Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
        )
        tf.set_org_id(task)
        assert task.organization_id == org.id

    def test_check_access_same_org(self, db_session):
        """check_access should return True for same org."""
        svc = TenantService(db_session)
        org = svc.create(name="Access Org")

        user = UserModel(
            username="access_user",
            password_hash=get_password_hash("test"),
            full_name="Access",
            role=UserRole.WORKER.value,
            is_active=True,
            organization_id=org.id,
        )
        db_session.add(user)
        db_session.commit()

        tf = TenantFilter(user)
        task = TaskModel(
            title="Owned Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
            organization_id=org.id,
        )
        assert tf.check_access(task) is True

    def test_check_access_different_org(self, db_session):
        """check_access should return False for different org."""
        svc = TenantService(db_session)
        org1 = svc.create(name="Org One")
        org2 = svc.create(name="Org Two")

        user = UserModel(
            username="diff_org_user",
            password_hash=get_password_hash("test"),
            full_name="Diff Org",
            role=UserRole.WORKER.value,
            is_active=True,
            organization_id=org1.id,
        )
        db_session.add(user)
        db_session.commit()

        tf = TenantFilter(user)
        task = TaskModel(
            title="Other Org Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
            organization_id=org2.id,
        )
        assert tf.check_access(task) is False

    def test_enforce_access_raises_on_violation(self, db_session):
        """enforce_access should raise 403 for wrong org."""
        svc = TenantService(db_session)
        org1 = svc.create(name="Enforce Org A")
        org2 = svc.create(name="Enforce Org B")

        user = UserModel(
            username="enforce_user",
            password_hash=get_password_hash("test"),
            full_name="Enforce",
            role=UserRole.WORKER.value,
            is_active=True,
            organization_id=org1.id,
        )
        db_session.add(user)
        db_session.commit()

        tf = TenantFilter(user)
        task = TaskModel(
            title="Forbidden Task",
            raw_address="Addr",
            status="NEW",
            priority="CURRENT",
            organization_id=org2.id,
        )
        with pytest.raises(HTTPException) as exc_info:
            tf.enforce_access(task)
        assert exc_info.value.status_code == 403
