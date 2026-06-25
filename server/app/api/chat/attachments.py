"""
Chat API — attachments
======================
Вложения сообщений: загрузка, скачивание и миниатюры (с проверкой
членства в чате).
"""

import asyncio
import os
import uuid
from typing import Optional, cast

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, get_db
from app.models.chat import MessageAttachmentModel, MessageModel, MessageType
from app.schemas.chat import MessageResponse
from app.services import chat_service, get_current_user_required
from app.services.websocket_manager import broadcast_chat_message_edited

router = APIRouter(prefix="/api/chat", tags=["Chat"])


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
            optimized_bytes, new_ext, _ = image_optimizer.optimize(
                content, thumb_ext, db
            )
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

    member_ids = chat_service.get_conversation_member_ids(db, msg.conversation_id)
    # Полное сообщение в payload → получатель подхватывает вложение и тип
    # без рефетча истории.
    asyncio.ensure_future(
        broadcast_chat_message_edited(
            member_user_ids=member_ids,
            conversation_id=msg.conversation_id,
            message_id=msg.id,
            new_text=result.text or "",
            sender_id=current_user.id,
            message=result.model_dump(mode="json"),
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
