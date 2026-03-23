"""Tests for notifications API security boundaries."""

from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (NotificationModel, OrganizationModel, TaskModel,
                        UserModel, UserRole)
from app.services.auth import get_password_hash
from app.services.notification_service import create_task_status_notification


class TestNotificationsApiSecurity:
    """Security tests for notifications endpoints."""

    def test_test_notification_requires_auth(self, client: TestClient):
        response = client.post("/api/notifications/test")

        assert response.status_code in [401, 403]

    def test_test_notification_allows_admin_only(
        self, client: TestClient, auth_headers: dict[str, str]
    ):
        with patch(
            "app.api.notifications._send_push_sync",
            return_value={"success": True, "message": "queued"},
        ):
            response = client.post("/api/notifications/test", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_tenant_admin_send_notification_is_org_scoped(
        self, client: TestClient, db_session: Session
    ):
        org = OrganizationModel(name="Org One", slug="org-one", is_active=True)
        admin = UserModel(
            username="tenant_admin",
            password_hash=get_password_hash("secret123"),
            full_name="Tenant Admin",
            role=UserRole.ADMIN.value,
            is_active=True,
            organization=org,
        )
        db_session.add_all([org, admin])
        db_session.commit()

        login = client.post(
            "/api/auth/login",
            data={"username": "tenant_admin", "password": "secret123"},
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        with patch(
            "app.api.notifications._send_push_sync",
            return_value={"success": True, "message": "queued"},
        ) as send_mock:
            response = client.post(
                "/api/notifications/send",
                json={
                    "title": "Hello",
                    "body": "World",
                    "notification_type": "general",
                },
                headers=headers,
            )

        assert response.status_code == 200
        assert send_mock.call_args.kwargs["organization_id"] == org.id

    def test_task_notifications_can_be_marked_read_per_task(
        self,
        client: TestClient,
        db_session: Session,
        auth_headers: dict[str, str],
        admin_user: UserModel,
    ):
        task = TaskModel(
            title="Unread task notifications",
            raw_address="Some address",
            status="NEW",
            priority="CURRENT",
        )
        db_session.add(task)
        db_session.commit()
        db_session.refresh(task)

        db_session.add_all(
            [
                NotificationModel(
                    user_id=admin_user.id,
                    title="Task updated",
                    message="A task event happened.",
                    type="task",
                    task_id=task.id,
                    is_read=False,
                ),
                NotificationModel(
                    user_id=admin_user.id,
                    title="Task alert",
                    message="An alert happened on the same task.",
                    type="alert",
                    task_id=task.id,
                    is_read=False,
                ),
            ]
        )
        db_session.commit()

        response = client.patch(
            f"/api/notifications/task/{task.id}/read", headers=auth_headers
        )

        assert response.status_code == 200
        assert response.json()["updated"] == 2

        unread_count = (
            db_session.query(NotificationModel)
            .filter(
                NotificationModel.user_id == admin_user.id,
                NotificationModel.task_id == task.id,
                NotificationModel.is_read == False,  # noqa: E712
            )
            .count()
        )
        assert unread_count == 0


class TestNotificationServiceTenantIsolation:
    def test_status_notifications_do_not_include_foreign_dispatchers(
        self, db_session: Session
    ):
        org1 = OrganizationModel(name="Org 1", slug="org-1", is_active=True)
        org2 = OrganizationModel(name="Org 2", slug="org-2", is_active=True)
        worker = UserModel(
            username="worker_notify",
            password_hash=get_password_hash("pass123"),
            full_name="Worker Notify",
            role=UserRole.WORKER.value,
            is_active=True,
            organization=org1,
        )
        dispatcher_same_org = UserModel(
            username="dispatcher_same",
            password_hash=get_password_hash("pass123"),
            full_name="Dispatcher Same",
            role=UserRole.DISPATCHER.value,
            is_active=True,
            organization=org1,
        )
        dispatcher_other_org = UserModel(
            username="dispatcher_other",
            password_hash=get_password_hash("pass123"),
            full_name="Dispatcher Other",
            role=UserRole.DISPATCHER.value,
            is_active=True,
            organization=org2,
        )
        task = TaskModel(
            title="Tenant Task",
            raw_address="Tenant Address",
            status="IN_PROGRESS",
            priority="CURRENT",
            organization=org1,
            assigned_user=worker,
        )
        db_session.add_all(
            [org1, org2, worker, dispatcher_same_org, dispatcher_other_org, task]
        )
        db_session.commit()
        db_session.refresh(task)
        db_session.refresh(worker)

        create_task_status_notification(
            db=db_session,
            task=task,
            old_status="NEW",
            new_status="IN_PROGRESS",
            changed_by=worker,
        )

        same_org_notification = (
            db_session.query(NotificationModel)
            .filter(
                NotificationModel.user_id == dispatcher_same_org.id,
                NotificationModel.task_id == task.id,
            )
            .first()
        )
        other_org_notification = (
            db_session.query(NotificationModel)
            .filter(
                NotificationModel.user_id == dispatcher_other_org.id,
                NotificationModel.task_id == task.id,
            )
            .first()
        )

        assert same_org_notification is not None
        assert other_org_notification is None

    def test_done_status_notifications_include_same_org_admin_and_dispatcher(
        self, db_session: Session
    ):
        org = OrganizationModel(name="Org Done", slug="org-done", is_active=True)
        worker = UserModel(
            username="worker_done_notify",
            password_hash=get_password_hash("pass123"),
            full_name="Worker Done",
            role=UserRole.WORKER.value,
            is_active=True,
            organization=org,
        )
        dispatcher = UserModel(
            username="dispatcher_done_notify",
            password_hash=get_password_hash("pass123"),
            full_name="Dispatcher Done",
            role=UserRole.DISPATCHER.value,
            is_active=True,
            organization=org,
        )
        admin = UserModel(
            username="admin_done_notify",
            password_hash=get_password_hash("pass123"),
            full_name="Admin Done",
            role=UserRole.ADMIN.value,
            is_active=True,
            organization=org,
        )
        task = TaskModel(
            title="Done Task",
            raw_address="Done Address",
            status="DONE",
            priority="CURRENT",
            organization=org,
            assigned_user=worker,
        )
        db_session.add_all([org, worker, dispatcher, admin, task])
        db_session.commit()
        db_session.refresh(task)
        db_session.refresh(worker)

        create_task_status_notification(
            db=db_session,
            task=task,
            old_status="IN_PROGRESS",
            new_status="DONE",
            changed_by=worker,
        )

        dispatcher_notification = (
            db_session.query(NotificationModel)
            .filter(
                NotificationModel.user_id == dispatcher.id,
                NotificationModel.task_id == task.id,
            )
            .first()
        )
        admin_notification = (
            db_session.query(NotificationModel)
            .filter(
                NotificationModel.user_id == admin.id,
                NotificationModel.task_id == task.id,
            )
            .first()
        )

        assert dispatcher_notification is not None
        assert admin_notification is not None
