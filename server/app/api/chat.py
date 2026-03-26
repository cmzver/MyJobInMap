"""
Chat API
========
REST-эндпоинты для чата: разговоры, сообщения, реакции, прочтение.
"""

import logging
import os
import uuid
from pathlib import Path
from typing import List, Optional, cast

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, get_db
from app.models.chat import (ConversationMemberModel, ConversationModel,
                             ConversationType, MessageAttachmentModel,
                             MessageModel, MessageType)
from app.schemas.chat import (ArchiveRequest, ConversationCreate,
                              ConversationDetailResponse, ConversationListItem,
                              ConversationResponse, ConversationUpdate,
                              MemberAddRequest, MemberInfo,
                              MemberRoleUpdateRequest, MessageCreate,
                              MessageListResponse, MessageResponse,
                              MessageSearchRequest, MessageUpdate, MuteRequest,
                              OwnershipTransferRequest, ReactionCreate,
                              ReactionInfo, ReadReceiptRequest)
from app.services import chat_service, get_current_user_required
from app.services.tenant_filter import TenantFilter
from app.services.websocket_manager import (
    broadcast_chat_conversation_updated, broadcast_chat_message,
    broadcast_chat_message_deleted, broadcast_chat_message_edited,
    broadcast_chat_reaction, broadcast_chat_read)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["Chat"])


# ========== Conversations ==========


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

    import asyncio

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
    avatar_url_str = cast(str, avatar_url)  # narrowed: guaranteed non-None by guard above
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

    import asyncio

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

    import asyncio

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

    import asyncio

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

    import asyncio

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

    import asyncio

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


# ========== Messages ==========


@router.get("/conversations/{conv_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conv_id: int,
    before_id: Optional[int] = Query(
        None, description="Cursor: ID сообщения (загрузить старше)"
    ),
    limit: int = Query(50, ge=1, le=100),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Сообщения чата с cursor-пагинацией."""
    return chat_service.get_messages(db, conv_id, current_user.id, before_id, limit)


@router.post("/conversations/{conv_id}/messages", response_model=MessageResponse)
async def send_message(
    conv_id: int,
    data: MessageCreate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Отправить сообщение."""
    result = chat_service.send_message(
        db,
        conv_id,
        current_user.id,
        text=data.text,
        reply_to_id=data.reply_to_id,
        message_type=data.message_type,
    )

    # WebSocket broadcast
    import asyncio

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)

    # Push notifications
    from app.services import send_push_notification
    notify_user_ids = [uid for uid in member_ids if uid != current_user.id]
    if notify_user_ids:
        conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()
        title = conv.name if conv and conv.name else (current_user.full_name or "Новое сообщение")
        
        send_push_notification(
            title=title,
            body=data.text[:100] if data.text else "Вложение",
            notification_type="chat_message",
            task_id=conv.task_id if conv else None,
            user_ids=notify_user_ids,
            extra_data={"chat_id": str(conv_id)}
        )

    asyncio.ensure_future(
        broadcast_chat_message(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            message_data={
                "id": result.id,
                "text": result.text,
                "sender_id": current_user.id,
            },
            sender_id=current_user.id,
        )
    )

    return result


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: int,
    data: MessageUpdate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Редактировать сообщение."""
    result = chat_service.edit_message(db, message_id, current_user.id, data.text)

    import asyncio

    member_ids = chat_service.get_conversation_member_ids(db, result.conversation_id)
    asyncio.ensure_future(
        broadcast_chat_message_edited(
            member_user_ids=member_ids,
            conversation_id=result.conversation_id,
            message_id=message_id,
            new_text=data.text,
            sender_id=current_user.id,
        )
    )

    return result


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Удалить сообщение (soft delete)."""
    # Получаем conv_id до удаления
    msg = db.query(MessageModel).filter(MessageModel.id == message_id).first()
    conv_id = msg.conversation_id if msg else None

    chat_service.delete_message(db, message_id, current_user.id)

    if conv_id:
        import asyncio

        member_ids = chat_service.get_conversation_member_ids(db, conv_id)
        asyncio.ensure_future(
            broadcast_chat_message_deleted(
                member_user_ids=member_ids,
                conversation_id=conv_id,
                message_id=message_id,
                sender_id=current_user.id,
            )
        )

    return {"detail": "ok"}


@router.post(
    "/conversations/{conv_id}/messages/search", response_model=List[MessageResponse]
)
async def search_messages(
    conv_id: int,
    data: MessageSearchRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Поиск по сообщениям в чате."""
    return chat_service.search_messages(db, conv_id, current_user.id, data.query)


# ========== Attachments ==========


@router.post("/messages/{message_id}/attachments", response_model=MessageResponse)
async def upload_attachment(
    message_id: int,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Загрузить вложение к сообщению."""
    msg = db.query(MessageModel).filter(MessageModel.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Сообщение не найдено")
    if msg.sender_id != current_user.id:
        raise HTTPException(403, "Нельзя добавлять вложения к чужим сообщениям")

    # Безопасное имя файла
    _raw_ext: str = os.path.splitext(file.filename or "file")[1]
    ext = _raw_ext[:10]
    safe_name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = os.path.join(settings.UPLOADS_DIR, "chat")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, safe_name)

    content: bytes = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(413, "Файл слишком большой (макс. 10 МБ)")

    with open(file_path, "wb") as f:
        f.write(content)

    # Thumbnail для изображений
    thumbnail_path = None
    mime = file.content_type or "application/octet-stream"
    if mime.startswith("image/"):
        try:
            from app.services import image_optimizer

            thumb_ext = os.path.splitext(safe_name)[1] or ".jpg"
            optimized_bytes, new_ext, _ = image_optimizer.optimize(content, thumb_ext)
            # Сохраняем оптимизированную версию как thumbnail
            thumb_name = f"thumb_{uuid.uuid4().hex}{new_ext}"
            thumb_full_path = os.path.join(upload_dir, thumb_name)
            with open(thumb_full_path, "wb") as tf:
                tf.write(optimized_bytes)
            thumbnail_path = f"chat/{thumb_name}"
        except Exception:
            pass  # Thumbnail необязателен

    attachment = MessageAttachmentModel(
        message_id=message_id,
        file_path=f"chat/{safe_name}",
        file_name=file.filename or safe_name,
        file_size=len(content),
        mime_type=mime,
        thumbnail_path=thumbnail_path,
    )
    db.add(attachment)

    # Обновить тип сообщения если image/file
    if mime.startswith("image/"):
        msg.message_type = MessageType.IMAGE.value
    else:
        msg.message_type = MessageType.FILE.value

    db.commit()
    db.refresh(msg)

    result = chat_service._build_message_response(db, msg)

    import asyncio

    member_ids = chat_service.get_conversation_member_ids(db, msg.conversation_id)
    asyncio.ensure_future(
        broadcast_chat_message_edited(
            member_user_ids=member_ids,
            conversation_id=msg.conversation_id,
            message_id=msg.id,
            new_text=result.text or "",
            sender_id=current_user.id,
        )
    )

    return result


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Скачать вложение сообщения с проверкой доступа к чату."""
    attachment = (
        db.query(MessageAttachmentModel)
        .filter(
            MessageAttachmentModel.id == attachment_id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(404, "Вложение не найдено")

    message = (
        db.query(MessageModel).filter(MessageModel.id == attachment.message_id).first()
    )
    if not message:
        raise HTTPException(404, "Сообщение не найдено")

    conversation_id = cast(int, message.conversation_id)
    user_id = cast(int, current_user.id)
    attachment_path = cast(str, attachment.file_path)
    attachment_name = cast(str, attachment.file_name)
    attachment_mime = cast(Optional[str], attachment.mime_type)

    chat_service._ensure_membership(db, conversation_id, user_id)

    chat_dir = os.path.realpath(os.path.join(settings.UPLOADS_DIR, "chat"))
    file_path = os.path.realpath(os.path.join(settings.UPLOADS_DIR, attachment_path))

    if os.path.commonpath([chat_dir, file_path]) != chat_dir:
        raise HTTPException(400, "Недопустимый путь к файлу")
    if not os.path.exists(file_path):
        raise HTTPException(404, "Файл не найден")

    return FileResponse(
        file_path,
        filename=attachment_name,
        media_type=attachment_mime or "application/octet-stream",
    )


@router.get("/attachments/{attachment_id}/thumbnail")
async def download_attachment_thumbnail(
    attachment_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Скачать thumbnail вложения сообщения с проверкой доступа к чату."""
    attachment = (
        db.query(MessageAttachmentModel)
        .filter(
            MessageAttachmentModel.id == attachment_id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(404, "Вложение не найдено")

    thumbnail_path = cast(Optional[str], attachment.thumbnail_path)
    if not thumbnail_path:
        raise HTTPException(404, "Миниатюра недоступна")

    message = (
        db.query(MessageModel).filter(MessageModel.id == attachment.message_id).first()
    )
    if not message:
        raise HTTPException(404, "Сообщение не найдено")

    conversation_id = cast(int, message.conversation_id)
    user_id = cast(int, current_user.id)
    attachment_mime = cast(Optional[str], attachment.mime_type)

    chat_service._ensure_membership(db, conversation_id, user_id)

    chat_dir = os.path.realpath(os.path.join(settings.UPLOADS_DIR, "chat"))
    file_path = os.path.realpath(os.path.join(settings.UPLOADS_DIR, thumbnail_path))

    if os.path.commonpath([chat_dir, file_path]) != chat_dir:
        raise HTTPException(400, "Недопустимый путь к файлу")
    if not os.path.exists(file_path):
        raise HTTPException(404, "Файл не найден")

    return FileResponse(
        file_path,
        filename=os.path.basename(file_path),
        media_type=attachment_mime or "application/octet-stream",
    )


# ========== Reactions ==========


@router.post("/messages/{message_id}/reactions", response_model=List[ReactionInfo])
async def toggle_reaction(
    message_id: int,
    data: ReactionCreate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Toggle реакцию на сообщение."""
    result = chat_service.toggle_reaction(db, message_id, current_user.id, data.emoji)

    msg = db.query(MessageModel).filter(MessageModel.id == message_id).first()
    if msg:
        import asyncio

        member_ids = chat_service.get_conversation_member_ids(db, msg.conversation_id)
        # Определить action по наличию реакции от этого пользователя
        has_reaction = any(
            current_user.id in (r.user_ids or [])
            for r in result
            if r.emoji == data.emoji
        )
        asyncio.ensure_future(
            broadcast_chat_reaction(
                member_user_ids=member_ids,
                conversation_id=msg.conversation_id,
                message_id=message_id,
                emoji=data.emoji,
                user_id=current_user.id,
                action="added" if has_reaction else "removed",
            )
        )

    return result


# ========== Read Receipts ==========


@router.post("/conversations/{conv_id}/read")
async def mark_as_read(
    conv_id: int,
    data: ReadReceiptRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Отметить сообщения как прочитанные."""
    chat_service.mark_as_read(db, conv_id, current_user.id, data.last_message_id)

    import asyncio

    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    asyncio.ensure_future(
        broadcast_chat_read(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            user_id=current_user.id,
            last_message_id=data.last_message_id,
        )
    )

    return {"detail": "ok"}


# ========== Task Chat Shortcut ==========


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
