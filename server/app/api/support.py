"""Support tickets API."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.models import (SupportTicketCategory, SupportTicketCommentModel,
                        SupportTicketCommentType, SupportTicketModel,
                        SupportTicketStatus, UserModel, get_db)
from app.models.base import utcnow
from app.schemas import (SupportTicketCommentCreate,
                         SupportTicketCommentResponse, SupportTicketCreate,
                         SupportTicketDetailResponse, SupportTicketReporter,
                         SupportTicketResponse, SupportTicketUpdate)
from app.services import create_notification, get_current_user_required
from app.services.role_utils import is_superadmin_user, public_role_value

router = APIRouter(prefix="/api/support", tags=["Support"])


def _ticket_query(db: Session):
    return db.query(SupportTicketModel).options(
        joinedload(SupportTicketModel.created_by),
        joinedload(SupportTicketModel.comments).joinedload(
            SupportTicketCommentModel.author
        ),
    )


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


def _serialize_ticket_detail(ticket: SupportTicketModel) -> SupportTicketDetailResponse:
    summary = _serialize_ticket(ticket)
    return SupportTicketDetailResponse(
        **summary.model_dump(),
        comments=[_serialize_comment(comment) for comment in ticket.comments],
    )


def _get_ticket_or_404(
    db: Session, current_user: UserModel, ticket_id: int
) -> SupportTicketModel:
    ticket = _ticket_query(db).filter(SupportTicketModel.id == ticket_id).first()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Тикет поддержки не найден")
    if is_superadmin_user(current_user):
        return ticket
    if ticket.created_by_id != current_user.id:
        raise HTTPException(status_code=404, detail="Тикет поддержки не найден")
    return ticket


def _add_status_comment(
    db: Session,
    *,
    ticket: SupportTicketModel,
    author: UserModel,
    old_status: str,
    new_status: str,
) -> None:
    db.add(
        SupportTicketCommentModel(
            ticket_id=ticket.id,
            author_id=author.id,
            comment_type=SupportTicketCommentType.STATUS_CHANGE.value,
            old_status=old_status,
            new_status=new_status,
        )
    )


def _add_text_comment(
    db: Session,
    *,
    ticket: SupportTicketModel,
    author: UserModel,
    body: str,
) -> None:
    db.add(
        SupportTicketCommentModel(
            ticket_id=ticket.id,
            author_id=author.id,
            comment_type=SupportTicketCommentType.COMMENT.value,
            body=body,
        )
    )


def _notify_superadmins(
    db: Session,
    *,
    ticket: SupportTicketModel,
    author: UserModel,
    title: str,
    message: str,
) -> None:
    recipients = (
        db.query(UserModel)
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
            db=db,
            user_id=recipient.id,
            title=title,
            message=message,
            notification_type="support",
            support_ticket_id=ticket.id,
        )


def _notify_ticket_author(
    db: Session,
    *,
    ticket: SupportTicketModel,
    author: UserModel,
    title: str,
    message: str,
) -> None:
    if ticket.created_by_id == author.id:
        return

    create_notification(
        db=db,
        user_id=ticket.created_by_id,
        title=title,
        message=message,
        notification_type="support",
        support_ticket_id=ticket.id,
    )


@router.get("/tickets", response_model=list[SupportTicketResponse])
async def list_support_tickets(
    scope: Literal["mine", "all"] = Query("mine"),
    status_filter: Optional[SupportTicketStatus] = Query(None, alias="status"),
    category: Optional[SupportTicketCategory] = None,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    query = _ticket_query(db)

    if not (scope == "all" and is_superadmin_user(current_user)):
        query = query.filter(SupportTicketModel.created_by_id == current_user.id)

    if status_filter is not None:
        query = query.filter(SupportTicketModel.status == status_filter.value)

    if category is not None:
        query = query.filter(SupportTicketModel.category == category.value)

    tickets = query.order_by(
        SupportTicketModel.updated_at.desc(), SupportTicketModel.created_at.desc()
    ).all()
    return [_serialize_ticket(ticket) for ticket in tickets]


@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetailResponse)
async def get_support_ticket(
    ticket_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ticket = _get_ticket_or_404(db, current_user, ticket_id)
    return _serialize_ticket_detail(ticket)


@router.post(
    "/tickets",
    response_model=SupportTicketResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_support_ticket(
    payload: SupportTicketCreate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ticket = SupportTicketModel(
        title=payload.title,
        description=payload.description,
        category=payload.category.value,
        status=SupportTicketStatus.NEW.value,
        created_by_id=current_user.id,
        organization_id=current_user.organization_id,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    ticket = _get_ticket_or_404(db, current_user, ticket.id)

    _notify_superadmins(
        db,
        ticket=ticket,
        author=current_user,
        title="Новое обращение в поддержку",
        message=f"{current_user.full_name or current_user.username}: {ticket.title}",
    )

    return _serialize_ticket(ticket)


@router.post(
    "/tickets/{ticket_id}/comments",
    response_model=SupportTicketCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_support_ticket_comment(
    ticket_id: int,
    payload: SupportTicketCommentCreate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    ticket = _get_ticket_or_404(db, current_user, ticket_id)

    ticket.updated_at = utcnow()
    _add_text_comment(db, ticket=ticket, author=current_user, body=payload.body)
    db.commit()
    db.refresh(ticket)
    ticket = _get_ticket_or_404(db, current_user, ticket_id)
    comment = ticket.comments[-1]

    if is_superadmin_user(current_user):
        ticket.admin_response = payload.body
        db.commit()
        db.refresh(ticket)
        _notify_ticket_author(
            db,
            ticket=ticket,
            author=current_user,
            title="Новый комментарий по обращению",
            message=f"По тикету «{ticket.title}» появился ответ поддержки.",
        )
    else:
        _notify_superadmins(
            db,
            ticket=ticket,
            author=current_user,
            title="Новый комментарий в тикете поддержки",
            message=f"{current_user.full_name or current_user.username}: {ticket.title}",
        )

    return _serialize_comment(comment)


@router.patch("/tickets/{ticket_id}", response_model=SupportTicketResponse)
async def update_support_ticket(
    ticket_id: int,
    payload: SupportTicketUpdate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    if not payload.model_fields_set:
        raise HTTPException(status_code=400, detail="Нет данных для обновления")
    if not is_superadmin_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="Только супер-админ может обновлять тикеты поддержки",
        )

    ticket = _get_ticket_or_404(db, current_user, ticket_id)
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
        if payload.status in (SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED):
            ticket.resolved_at = utcnow()
        else:
            ticket.resolved_at = None

    if "admin_response" in payload.model_fields_set:
        if payload.admin_response != ticket.admin_response:
            ticket.admin_response = payload.admin_response
            response_changed = bool(payload.admin_response)

    if status_changed:
        _add_status_comment(
            db,
            ticket=ticket,
            author=current_user,
            old_status=old_status,
            new_status=ticket.status,
        )

    if response_changed and ticket.admin_response:
        _add_text_comment(
            db,
            ticket=ticket,
            author=current_user,
            body=ticket.admin_response,
        )

    db.commit()
    db.refresh(ticket)
    ticket = _get_ticket_or_404(db, current_user, ticket.id)

    if status_changed or response_changed:
        _notify_ticket_author(
            db,
            ticket=ticket,
            author=current_user,
            title="Обновление по обращению",
            message=f"Тикет «{ticket.title}» обновлён. Текущий статус: {ticket.status}.",
        )

    return _serialize_ticket(ticket)
