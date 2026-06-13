"""Support tickets API — тонкие контроллеры поверх SupportService."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.models import (
    SupportTicketCategory,
    SupportTicketStatus,
    UserModel,
    get_db,
)
from app.schemas import (
    SupportTicketCommentCreate,
    SupportTicketCommentResponse,
    SupportTicketCreate,
    SupportTicketDetailResponse,
    SupportTicketResponse,
    SupportTicketUpdate,
)
from app.services import (
    SupportService,
    SupportServiceError,
    get_current_user_required,
    get_support_service,
)

router = APIRouter(prefix="/api/support", tags=["Support"])


@router.get("/tickets", response_model=list[SupportTicketResponse])
async def list_support_tickets(
    scope: Literal["mine", "all"] = Query("mine"),
    status_filter: Optional[SupportTicketStatus] = Query(None, alias="status"),
    category: Optional[SupportTicketCategory] = None,
    current_user: UserModel = Depends(get_current_user_required),
    service: SupportService = Depends(get_support_service),
):
    return service.list_tickets(
        current_user,
        scope=scope,
        status_filter=status_filter,
        category=category,
    )


@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetailResponse)
async def get_support_ticket(
    ticket_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    service: SupportService = Depends(get_support_service),
):
    try:
        return service.get_ticket_detail(current_user, ticket_id)
    except SupportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post(
    "/tickets",
    response_model=SupportTicketResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_support_ticket(
    payload: SupportTicketCreate,
    current_user: UserModel = Depends(get_current_user_required),
    service: SupportService = Depends(get_support_service),
):
    try:
        return service.create_ticket(current_user, payload)
    except SupportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post(
    "/tickets/{ticket_id}/comments",
    response_model=SupportTicketCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_support_ticket_comment(
    ticket_id: int,
    payload: SupportTicketCommentCreate,
    current_user: UserModel = Depends(get_current_user_required),
    service: SupportService = Depends(get_support_service),
):
    try:
        return service.add_comment(current_user, ticket_id, payload)
    except SupportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.patch("/tickets/{ticket_id}", response_model=SupportTicketResponse)
async def update_support_ticket(
    ticket_id: int,
    payload: SupportTicketUpdate,
    current_user: UserModel = Depends(get_current_user_required),
    service: SupportService = Depends(get_support_service),
):
    try:
        return service.update_ticket(current_user, ticket_id, payload)
    except SupportServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
