"""
Chat API — conversations
========================
Разговоры: список/создание/детали/обновление, аватары, участники,
mute/archive и шорткат чата заявки.
"""

import asyncio
import uuid
from pathlib import Path
from typing import List, Optional, cast

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, get_db
from app.models.chat import ConversationModel, ConversationType
from app.schemas.chat import (
    ArchiveRequest,
    ConversationCreate,
    ConversationDetailResponse,
    ConversationListItem,
    ConversationResponse,
    ConversationUpdate,
    MemberAddRequest,
    MemberInfo,
    MemberRoleUpdateRequest,
    MuteRequest,
    OwnershipTransferRequest,
)
from app.services import chat_service, get_current_user_required
from app.services.tenant_filter import TenantFilter
from app.services.websocket_manager import broadcast_chat_conversation_updated

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.get("/conversations", response_model=List[ConversationListItem])
async def list_conversations(
    include_archived: bool = Query(False, description="Включая архивные"),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Список чатов текущего пользователя."""
    tenant = TenantFilter(current_user)
    return chat_service.get_user_conversations(
        db,
        user_id=current_user.id,
        organization_id=current_user.organization_id,
        is_superadmin=tenant.is_superadmin,
        include_archived=include_archived,
    )


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    data: ConversationCreate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Создать чат (direct, group, org_general)."""
    conv = chat_service.create_conversation(
        db,
        conv_type=data.type,
        creator_id=current_user.id,
        organization_id=current_user.organization_id,
        name=data.name,
        task_id=data.task_id,
        member_user_ids=data.member_user_ids,
    )
    return ConversationResponse.model_validate(conv)


@router.get("/conversations/{conv_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    conv_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Детали чата с участниками."""
    return chat_service.get_conversation_detail(db, conv_id, current_user.id)


@router.patch("/conversations/{conv_id}", response_model=ConversationResponse)
async def update_conversation(
    conv_id: int,
    data: ConversationUpdate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Обновить название / аватар чата."""
    conv = chat_service.update_conversation(
        db,
        conv_id,
        current_user.id,
        name=data.name,
        avatar_url=data.avatar_url,
    )

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    asyncio.ensure_future(
        broadcast_chat_conversation_updated(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            action=(
                "conversation_renamed"
                if data.name is not None
                else "conversation_updated"
            ),
            actor_user_id=current_user.id,
            name=conv.name,
        )
    )
    return ConversationResponse.model_validate(conv)


@router.get("/conversations/{conv_id}/avatar/{file_name}", include_in_schema=False)
async def get_conversation_avatar(
    conv_id: int,
    file_name: str,
    db: Session = Depends(get_db),
):
    """Получить аватар чата по публичному URL."""
    conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()
    avatar_url = cast(Optional[str], conv.avatar_url) if conv else None
    if not conv or not avatar_url:
        raise HTTPException(status_code=404, detail="Avatar not found")

    expected_prefix = f"/api/chat/conversations/{conv_id}/avatar/"
    avatar_url_str = cast(
        str, avatar_url
    )  # narrowed: guaranteed non-None by guard above
    if not avatar_url_str.startswith(expected_prefix):
        raise HTTPException(status_code=404, detail="Avatar not found")

    avatar_name = Path(avatar_url_str).name
    if avatar_name != file_name:
        raise HTTPException(status_code=404, detail="Avatar not found")

    full_path = (
        settings.UPLOADS_DIR / "chat_avatars" / str(conv_id) / avatar_name
    ).resolve()
    avatars_root = (settings.UPLOADS_DIR / "chat_avatars").resolve()
    if avatars_root not in full_path.parents:
        raise HTTPException(status_code=404, detail="Avatar not found")
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="Avatar not found")

    return FileResponse(full_path)


@router.post("/conversations/{conv_id}/avatar", response_model=ConversationResponse)
async def upload_conversation_avatar(
    conv_id: int,
    avatar: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Загрузить аватар группового чата."""
    current_user_id = cast(int, current_user.id)
    conv = chat_service._get_conversation_or_404(db, conv_id)
    member = chat_service._ensure_membership(db, conv_id, current_user_id)
    conv_type = cast(str, conv.type)
    conv_avatar_url = cast(Optional[str], conv.avatar_url)
    conv_name = cast(Optional[str], conv.name)
    member_role = cast(str, member.role)

    if conv_type == ConversationType.DIRECT.value:
        raise HTTPException(status_code=400, detail="Нельзя менять аватар direct-чата")
    if member_role not in {"owner", "admin"}:
        raise HTTPException(
            status_code=403, detail="Недостаточно прав для изменения аватара"
        )
    if not avatar.content_type or not avatar.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Разрешены только изображения")

    content = await avatar.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail="Размер файла не должен превышать 5 МБ"
        )

    extension = Path(avatar.filename or "avatar").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(
            status_code=400, detail="Поддерживаются JPG, PNG, WEBP и GIF"
        )

    avatar_dir = settings.UPLOADS_DIR / "chat_avatars" / str(conv_id)
    avatar_dir.mkdir(parents=True, exist_ok=True)

    if conv_avatar_url:
        old_name = Path(conv_avatar_url).name
        old_path = (avatar_dir / old_name).resolve()
        avatars_root = (settings.UPLOADS_DIR / "chat_avatars").resolve()
        if (
            avatars_root in old_path.parents
            and old_path.exists()
            and old_path.is_file()
        ):
            old_path.unlink(missing_ok=True)

    file_name = f"{uuid.uuid4().hex}{extension}"
    destination = avatar_dir / file_name
    destination.write_bytes(content)

    setattr(conv, "avatar_url", f"/api/chat/conversations/{conv_id}/avatar/{file_name}")
    db.commit()
    db.refresh(conv)

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    asyncio.ensure_future(
        broadcast_chat_conversation_updated(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            action="conversation_avatar_updated",
            actor_user_id=current_user_id,
            name=conv_name,
        )
    )

    return ConversationResponse.model_validate(conv)


@router.post("/conversations/{conv_id}/members", response_model=List[MemberInfo])
async def add_members(
    conv_id: int,
    data: MemberAddRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Добавить участников в чат."""
    members = chat_service.add_members(db, conv_id, data.user_ids, current_user.id)

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    for added_user_id in data.user_ids:
        asyncio.ensure_future(
            broadcast_chat_conversation_updated(
                member_user_ids=member_ids,
                conversation_id=conv_id,
                action="member_added",
                actor_user_id=current_user.id,
                target_user_id=added_user_id,
            )
        )

    return members


@router.delete("/conversations/{conv_id}/members/{user_id}")
async def remove_member(
    conv_id: int,
    user_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Удалить участника из чата или выйти."""
    chat_service.remove_member(db, conv_id, user_id, current_user.id)

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    notify_ids = list(dict.fromkeys(member_ids + [user_id]))
    asyncio.ensure_future(
        broadcast_chat_conversation_updated(
            member_user_ids=notify_ids,
            conversation_id=conv_id,
            action="member_removed",
            actor_user_id=current_user.id,
            target_user_id=user_id,
        )
    )
    return {"detail": "ok"}


@router.patch(
    "/conversations/{conv_id}/members/{user_id}", response_model=List[MemberInfo]
)
async def update_member_role(
    conv_id: int,
    user_id: int,
    data: MemberRoleUpdateRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Изменить роль участника в чате."""
    members = chat_service.update_member_role(
        db, conv_id, user_id, data.role, current_user.id
    )

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    asyncio.ensure_future(
        broadcast_chat_conversation_updated(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            action="member_role_updated",
            actor_user_id=current_user.id,
            target_user_id=user_id,
            role=data.role,
        )
    )
    return members


@router.post(
    "/conversations/{conv_id}/transfer-ownership", response_model=List[MemberInfo]
)
async def transfer_ownership(
    conv_id: int,
    data: OwnershipTransferRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Передать ownership другому участнику."""
    members = chat_service.transfer_ownership(
        db, conv_id, data.user_id, current_user.id
    )

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    asyncio.ensure_future(
        broadcast_chat_conversation_updated(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            action="ownership_transferred",
            actor_user_id=current_user.id,
            target_user_id=data.user_id,
            role="owner",
        )
    )
    return members


@router.patch("/conversations/{conv_id}/mute")
async def mute_conversation(
    conv_id: int,
    data: MuteRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Mute / unmute чата."""
    chat_service.mute_conversation(db, conv_id, current_user.id, data.is_muted)
    return {"detail": "ok"}


@router.patch("/conversations/{conv_id}/archive")
async def archive_conversation(
    conv_id: int,
    data: ArchiveRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Archive / unarchive чата."""
    chat_service.archive_conversation(db, conv_id, current_user.id, data.is_archived)
    return {"detail": "ok"}


@router.get("/task/{task_id}", response_model=ConversationResponse)
async def get_task_chat(
    task_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Получить/создать чат заявки."""
    conv = chat_service.get_or_create_task_conversation(
        db,
        task_id,
        current_user.id,
        current_user.organization_id,
    )
    return ConversationResponse.model_validate(conv)
