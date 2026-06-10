"""
Support Service
===============
Бизнес-логика тикетов поддержки: список, детали, создание, комментарии,
обновление статуса/ответа и уведомления. Роутер app/api/support.py — тонкий.
"""

from typing import List, Optional

from fastapi import Depends
from sqlalchemy.orm import Session, joinedload

from app.models import (
    SupportTicketCommentModel,
    SupportTicketCommentType,
    SupportTicketModel,
    SupportTicketStatus,
    UserModel,
    get_db,
)
from app.models.base import utcnow
from app.schemas import (
    SupportTicketCommentCreate,
    SupportTicketCommentResponse,
    SupportTicketCreate,
    SupportTicketDetailResponse,
    SupportTicketReporter,
    SupportTicketResponse,
    SupportTicketUpdate,
)
from app.services.notification_service import create_notification
from app.services.role_utils import is_superadmin_user, public_role_value


class SupportServiceError(Exception):
    """Исключение операций с тикетами поддержки."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


def _serialize_user(user: UserModel) -> SupportTicketReporter:
    return SupportTicketReporter(
        id=user.id,
        username=user.username,
        full_name=user.full_name or "",
        role=public_role_value(user.role, user.organization_id),
        organization_id=user.organization_id,
    )


def _serialize_comment(
    comment: SupportTicketCommentModel,
) -> SupportTicketCommentResponse:
    return SupportTicketCommentResponse(
        id=comment.id,
        comment_type=comment.comment_type,
        body=comment.body,
        old_status=comment.old_status,
        new_status=comment.new_status,
        created_at=comment.created_at,
        author=_serialize_user(comment.author),
    )


def _serialize_ticket(ticket: SupportTicketModel) -> SupportTicketResponse:
    return SupportTicketResponse(
        id=ticket.id,
        title=ticket.title,
        description=ticket.description,
        category=ticket.category,
        status=ticket.status,
        admin_response=ticket.admin_response,
        organization_id=ticket.organization_id,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        resolved_at=ticket.resolved_at,
        created_by=_serialize_user(ticket.created_by),
    )


def _serialize_ticket_detail(
    ticket: SupportTicketModel,
) -> SupportTicketDetailResponse:
    summary = _serialize_ticket(ticket)
    return SupportTicketDetailResponse(
        **summary.model_dump(),
        comments=[_serialize_comment(comment) for comment in ticket.comments],
    )


class SupportService:
    """Операции с тикетами поддержки и уведомления по ним."""

    def __init__(self, db: Session):
        self.db = db

    # ---- queries -----------------------------------------------------------

    def _ticket_query(self):
        return self.db.query(SupportTicketModel).options(
            joinedload(SupportTicketModel.created_by),
            joinedload(SupportTicketModel.comments).joinedload(
                SupportTicketCommentModel.author
            ),
        )

    def _get_ticket_or_404(
        self, current_user: UserModel, ticket_id: int
    ) -> SupportTicketModel:
        ticket = self._ticket_query().filter(SupportTicketModel.id == ticket_id).first()
        if ticket is None:
            raise SupportServiceError("Тикет поддержки не найден", 404)
        if is_superadmin_user(current_user):
            return ticket
        if ticket.created_by_id != current_user.id:
            raise SupportServiceError("Тикет поддержки не найден", 404)
        return ticket

    # ---- comments ----------------------------------------------------------

    def _add_status_comment(
        self,
        *,
        ticket: SupportTicketModel,
        author: UserModel,
        old_status: str,
        new_status: str,
    ) -> None:
        self.db.add(
            SupportTicketCommentModel(
                ticket_id=ticket.id,
                author_id=author.id,
                comment_type=SupportTicketCommentType.STATUS_CHANGE.value,
                old_status=old_status,
                new_status=new_status,
            )
        )

    def _add_text_comment(
        self,
        *,
        ticket: SupportTicketModel,
        author: UserModel,
        body: str,
    ) -> None:
        self.db.add(
            SupportTicketCommentModel(
                ticket_id=ticket.id,
                author_id=author.id,
                comment_type=SupportTicketCommentType.COMMENT.value,
                body=body,
            )
        )

    # ---- notifications -----------------------------------------------------

    def _notify_superadmins(
        self,
        *,
        ticket: SupportTicketModel,
        author: UserModel,
        title: str,
        message: str,
    ) -> None:
        recipients = (
            self.db.query(UserModel)
            .filter(
                UserModel.id != author.id,
                UserModel.is_active == True,  # noqa: E712
                UserModel.role == "admin",
                UserModel.organization_id.is_(None),
            )
            .all()
        )

        for recipient in recipients:
            create_notification(
                db=self.db,
                user_id=recipient.id,
                title=title,
                message=message,
                notification_type="support",
                support_ticket_id=ticket.id,
            )

    def _notify_ticket_author(
        self,
        *,
        ticket: SupportTicketModel,
        author: UserModel,
        title: str,
        message: str,
    ) -> None:
        if ticket.created_by_id == author.id:
            return

        create_notification(
            db=self.db,
            user_id=ticket.created_by_id,
            title=title,
            message=message,
            notification_type="support",
            support_ticket_id=ticket.id,
        )

    # ---- public API --------------------------------------------------------

    def list_tickets(
        self,
        current_user: UserModel,
        *,
        scope: str,
        status_filter: Optional[SupportTicketStatus],
        category,
    ) -> List[SupportTicketResponse]:
        query = self._ticket_query()

        if not (scope == "all" and is_superadmin_user(current_user)):
            query = query.filter(SupportTicketModel.created_by_id == current_user.id)

        if status_filter is not None:
            query = query.filter(SupportTicketModel.status == status_filter.value)

        if category is not None:
            query = query.filter(SupportTicketModel.category == category.value)

        tickets = query.order_by(
            SupportTicketModel.updated_at.desc(),
            SupportTicketModel.created_at.desc(),
        ).all()
        return [_serialize_ticket(ticket) for ticket in tickets]

    def get_ticket_detail(
        self, current_user: UserModel, ticket_id: int
    ) -> SupportTicketDetailResponse:
        ticket = self._get_ticket_or_404(current_user, ticket_id)
        return _serialize_ticket_detail(ticket)

    def create_ticket(
        self, current_user: UserModel, payload: SupportTicketCreate
    ) -> SupportTicketResponse:
        ticket = SupportTicketModel(
            title=payload.title,
            description=payload.description,
            category=payload.category.value,
            status=SupportTicketStatus.NEW.value,
            created_by_id=current_user.id,
            organization_id=current_user.organization_id,
        )
        self.db.add(ticket)
        self.db.commit()
        self.db.refresh(ticket)
        ticket = self._get_ticket_or_404(current_user, ticket.id)

        self._notify_superadmins(
            ticket=ticket,
            author=current_user,
            title="Новое обращение в поддержку",
            message=f"{current_user.full_name or current_user.username}: {ticket.title}",
        )

        return _serialize_ticket(ticket)

    def add_comment(
        self,
        current_user: UserModel,
        ticket_id: int,
        payload: SupportTicketCommentCreate,
    ) -> SupportTicketCommentResponse:
        ticket = self._get_ticket_or_404(current_user, ticket_id)

        ticket.updated_at = utcnow()
        self._add_text_comment(ticket=ticket, author=current_user, body=payload.body)
        self.db.commit()
        self.db.refresh(ticket)
        ticket = self._get_ticket_or_404(current_user, ticket_id)
        comment = ticket.comments[-1]

        if is_superadmin_user(current_user):
            ticket.admin_response = payload.body
            self.db.commit()
            self.db.refresh(ticket)
            self._notify_ticket_author(
                ticket=ticket,
                author=current_user,
                title="Новый комментарий по обращению",
                message=f"По тикету «{ticket.title}» появился ответ поддержки.",
            )
        else:
            self._notify_superadmins(
                ticket=ticket,
                author=current_user,
                title="Новый комментарий в тикете поддержки",
                message=f"{current_user.full_name or current_user.username}: {ticket.title}",
            )

        return _serialize_comment(comment)

    def update_ticket(
        self,
        current_user: UserModel,
        ticket_id: int,
        payload: SupportTicketUpdate,
    ) -> SupportTicketResponse:
        if not payload.model_fields_set:
            raise SupportServiceError("Нет данных для обновления", 400)
        if not is_superadmin_user(current_user):
            raise SupportServiceError(
                "Только супер-админ может обновлять тикеты поддержки", 403
            )

        ticket = self._get_ticket_or_404(current_user, ticket_id)
        old_status = ticket.status
        status_changed = False
        response_changed = False

        if (
            "status" in payload.model_fields_set
            and payload.status is not None
            and payload.status.value != ticket.status
        ):
            ticket.status = payload.status.value
            status_changed = True
            if payload.status in (
                SupportTicketStatus.RESOLVED,
                SupportTicketStatus.CLOSED,
            ):
                ticket.resolved_at = utcnow()
            else:
                ticket.resolved_at = None

        if "admin_response" in payload.model_fields_set:
            if payload.admin_response != ticket.admin_response:
                ticket.admin_response = payload.admin_response
                response_changed = bool(payload.admin_response)

        if status_changed:
            self._add_status_comment(
                ticket=ticket,
                author=current_user,
                old_status=old_status,
                new_status=ticket.status,
            )

        if response_changed and ticket.admin_response:
            self._add_text_comment(
                ticket=ticket,
                author=current_user,
                body=ticket.admin_response,
            )

        self.db.commit()
        self.db.refresh(ticket)
        ticket = self._get_ticket_or_404(current_user, ticket.id)

        if status_changed or response_changed:
            self._notify_ticket_author(
                ticket=ticket,
                author=current_user,
                title="Обновление по обращению",
                message=f"Тикет «{ticket.title}» обновлён. Текущий статус: {ticket.status}.",
            )

        return _serialize_ticket(ticket)


def get_support_service(db: Session = Depends(get_db)) -> SupportService:
    return SupportService(db)
