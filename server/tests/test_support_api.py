"""Tests for support tickets API."""

from fastapi.testclient import TestClient

from app.models import (NotificationModel, OrganizationModel,
                        SupportTicketModel, UserModel, UserRole)
from app.services.auth import get_password_hash


def _login_headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login", data={"username": username, "password": password}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_org_user(
    db_session,
    *,
    username: str,
    password: str,
    role: str,
    organization_id: int | None = None,
) -> UserModel:
    user = UserModel(
        username=username,
        password_hash=get_password_hash(password),
        full_name=username,
        role=role,
        is_active=True,
        organization_id=organization_id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_login_exposes_default_admin_as_superadmin(client: TestClient, admin_user):
    response = client.post(
        "/api/auth/login", data={"username": "admin", "password": "admin"}
    )

    assert response.status_code == 200
    assert response.json()["role"] == "superadmin"


def test_user_can_create_list_and_view_own_support_ticket(
    client_with_worker, worker_user
):
    response = client_with_worker.post(
        "/api/support/tickets",
        json={
            "title": "Address card bug",
            "description": "Equipment tab does not persist a newly added item after refresh.",
            "category": "bug",
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "Address card bug"
    assert created["category"] == "bug"
    assert created["status"] == "new"
    assert created["created_by"]["id"] == worker_user.id

    list_response = client_with_worker.get("/api/support/tickets")
    assert list_response.status_code == 200
    tickets = list_response.json()
    assert len(tickets) == 1
    assert tickets[0]["id"] == created["id"]

    detail_response = client_with_worker.get(f"/api/support/tickets/{created['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["comments"] == []


def test_superadmin_can_view_all_update_status_and_comment(
    client: TestClient, db_session, admin_user
):
    worker = _create_org_user(
        db_session,
        username="support_worker",
        password="pass123",
        role=UserRole.WORKER.value,
    )
    ticket = SupportTicketModel(
        title="Need better filters",
        description="Add a quick filter by assignee and priority on the same panel.",
        category="improvement",
        status="new",
        created_by_id=worker.id,
    )
    db_session.add(ticket)
    db_session.commit()
    db_session.refresh(ticket)

    headers = _login_headers(client, "admin", "admin")

    list_response = client.get("/api/support/tickets?scope=all", headers=headers)
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [ticket.id]

    update_response = client.patch(
        f"/api/support/tickets/{ticket.id}",
        json={
            "status": "resolved",
            "admin_response": "Fix will be included in the next release.",
        },
        headers=headers,
    )
    assert update_response.status_code == 200
    data = update_response.json()
    assert data["status"] == "resolved"
    assert data["admin_response"] == "Fix will be included in the next release."
    assert data["resolved_at"] is not None

    comment_response = client.post(
        f"/api/support/tickets/{ticket.id}/comments",
        json={"body": "Temporary workaround has been added."},
        headers=headers,
    )
    assert comment_response.status_code == 201
    assert comment_response.json()["body"] == "Temporary workaround has been added."

    detail_response = client.get(f"/api/support/tickets/{ticket.id}", headers=headers)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert [item["comment_type"] for item in detail["comments"]] == [
        "status_change",
        "comment",
        "comment",
    ]
    assert detail["comments"][0]["old_status"] == "new"
    assert detail["comments"][0]["new_status"] == "resolved"
    assert detail["comments"][-1]["body"] == "Temporary workaround has been added."

    worker_notifications = (
        db_session.query(NotificationModel)
        .filter(NotificationModel.user_id == worker.id)
        .order_by(NotificationModel.id.asc())
        .all()
    )
    assert len(worker_notifications) == 2
    assert all(notification.type == "support" for notification in worker_notifications)
    assert all(
        notification.support_ticket_id == ticket.id
        for notification in worker_notifications
    )


def test_user_can_comment_own_ticket_but_cannot_manage_other_tickets(
    client: TestClient,
    db_session,
    admin_user,
):
    worker = _create_org_user(
        db_session,
        username="support_worker_only",
        password="pass123",
        role=UserRole.WORKER.value,
    )
    other_worker = _create_org_user(
        db_session,
        username="support_worker_other",
        password="pass123",
        role=UserRole.WORKER.value,
    )
    ticket = SupportTicketModel(
        title="Feedback item",
        description="Show a more visible message when report generation is completed.",
        category="feedback",
        status="new",
        created_by_id=worker.id,
    )
    foreign_ticket = SupportTicketModel(
        title="Foreign ticket",
        description="This ticket must stay hidden from other users.",
        category="bug",
        status="new",
        created_by_id=other_worker.id,
    )
    db_session.add_all([ticket, foreign_ticket])
    db_session.commit()
    db_session.refresh(ticket)
    db_session.refresh(foreign_ticket)

    headers = _login_headers(client, worker.username, "pass123")

    comment_response = client.post(
        f"/api/support/tickets/{ticket.id}/comments",
        json={"body": "Added exact reproduction steps."},
        headers=headers,
    )
    assert comment_response.status_code == 201
    assert comment_response.json()["comment_type"] == "comment"

    detail_response = client.get(f"/api/support/tickets/{ticket.id}", headers=headers)
    assert detail_response.status_code == 200
    assert (
        detail_response.json()["comments"][-1]["body"]
        == "Added exact reproduction steps."
    )

    admin_notifications = (
        db_session.query(NotificationModel)
        .filter(NotificationModel.user_id == admin_user.id)
        .order_by(NotificationModel.id.asc())
        .all()
    )
    assert len(admin_notifications) == 1
    assert admin_notifications[0].type == "support"
    assert admin_notifications[0].support_ticket_id == ticket.id

    mark_read_response = client.patch(
        f"/api/notifications/support-ticket/{ticket.id}/read", headers=headers
    )
    assert mark_read_response.status_code == 200
    assert mark_read_response.json()["updated"] == 0

    list_response = client.get("/api/support/tickets?scope=all", headers=headers)
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [ticket.id]

    foreign_detail = client.get(
        f"/api/support/tickets/{foreign_ticket.id}", headers=headers
    )
    assert foreign_detail.status_code == 404

    update_response = client.patch(
        f"/api/support/tickets/{ticket.id}",
        json={"status": "resolved"},
        headers=headers,
    )
    assert update_response.status_code == 403


def test_support_ticket_creator_role_is_normalized_for_public_api(
    client: TestClient, db_session, admin_user
):
    org = OrganizationModel(name="Support Org", slug="support-org")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    manager = _create_org_user(
        db_session,
        username="support_dispatcher",
        password="pass123",
        role=UserRole.DISPATCHER.value,
        organization_id=org.id,
    )
    ticket = SupportTicketModel(
        title="Creator role",
        description="Ensure dispatcher is exposed as dispatcher in public API.",
        category="feedback",
        status="new",
        created_by_id=manager.id,
        organization_id=org.id,
    )
    db_session.add(ticket)
    db_session.commit()
    db_session.refresh(ticket)

    headers = _login_headers(client, "admin", "admin")
    response = client.get(f"/api/support/tickets/{ticket.id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["created_by"]["role"] == "dispatcher"


def test_support_notifications_can_be_marked_read_per_ticket(
    client: TestClient, db_session, admin_user
):
    worker = _create_org_user(
        db_session,
        username="support_reader",
        password="pass123",
        role=UserRole.WORKER.value,
    )
    ticket = SupportTicketModel(
        title="Compact support page",
        description="Need denser cards and local unread bubbles.",
        category="improvement",
        status="new",
        created_by_id=worker.id,
    )
    db_session.add(ticket)
    db_session.commit()
    db_session.refresh(ticket)

    admin_headers = _login_headers(client, "admin", "admin")

    response = client.post(
        f"/api/support/tickets/{ticket.id}/comments",
        json={"body": "Please compact the page and add a ticket bubble."},
        headers=_login_headers(client, worker.username, "pass123"),
    )
    assert response.status_code == 201

    unread_before = (
        db_session.query(NotificationModel)
        .filter(
            NotificationModel.user_id == admin_user.id,
            NotificationModel.type == "support",
            NotificationModel.support_ticket_id == ticket.id,
            NotificationModel.is_read == False,  # noqa: E712
        )
        .count()
    )
    assert unread_before == 1

    mark_read_response = client.patch(
        f"/api/notifications/support-ticket/{ticket.id}/read", headers=admin_headers
    )
    assert mark_read_response.status_code == 200
    assert mark_read_response.json()["updated"] == 1

    unread_after = (
        db_session.query(NotificationModel)
        .filter(
            NotificationModel.user_id == admin_user.id,
            NotificationModel.type == "support",
            NotificationModel.support_ticket_id == ticket.id,
            NotificationModel.is_read == False,  # noqa: E712
        )
        .count()
    )
    assert unread_after == 0


def test_legacy_support_notifications_are_inferred_and_marked_read(
    client: TestClient, db_session
):
    worker = _create_org_user(
        db_session,
        username="support_legacy_worker",
        password="pass123",
        role=UserRole.WORKER.value,
    )
    ticket = SupportTicketModel(
        title="Legacy inferred ticket",
        description="Old notification should still map to the correct support ticket.",
        category="feedback",
        status="new",
        created_by_id=worker.id,
    )
    db_session.add(ticket)
    db_session.commit()
    db_session.refresh(ticket)

    legacy_notification = NotificationModel(
        user_id=worker.id,
        title="Обновление по обращению",
        message=f"Тикет «{ticket.title}» обновлён поддержкой.",
        type="support",
        is_read=False,
    )
    db_session.add(legacy_notification)
    db_session.commit()
    db_session.refresh(legacy_notification)

    headers = _login_headers(client, worker.username, "pass123")

    notifications_response = client.get(
        "/api/notifications?is_read=false", headers=headers
    )
    assert notifications_response.status_code == 200
    notifications = notifications_response.json()
    assert len(notifications) == 1
    assert notifications[0]["support_ticket_id"] == ticket.id

    mark_read_response = client.patch(
        f"/api/notifications/support-ticket/{ticket.id}/read", headers=headers
    )
    assert mark_read_response.status_code == 200
    assert mark_read_response.json()["updated"] == 1

    db_session.refresh(legacy_notification)
    assert legacy_notification.is_read is True
