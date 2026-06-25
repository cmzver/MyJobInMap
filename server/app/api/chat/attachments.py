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

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.models import UserModel, get_db
from app.models.chat import (
    ConversationModel,
    MessageAttachmentModel,
    MessageModel,
    MessageType,
)
from app.schemas.chat import MessageResponse
from app.services import chat_service, get_current_user_required
from app.services.websocket_manager import (
    broadcast_chat_message,
    broadcast_chat_message_edited,
)

router = APIRouter(prefix="/api/chat", tags=["Chat"])

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10 МБ


def _persist_chat_file(
    db: Session, file: UploadFile, content: bytes
) -> tuple[str, Optional[str], str]:
    """Сохранить файл вложения (+thumbnail для картинок) на диск.

    Возвращает (относительный путь файла, путь thumbnail|None, mime).
    """
    raw_ext = os.path.splitext(file.filename or "file")[1]
    safe_name = f"{uuid.uuid4().hex}{raw_ext[:10]}"
    upload_dir = os.path.join(settings.UPLOADS_DIR, "chat")
    os.makedirs(upload_dir, exist_ok=True)

    with open(os.path.join(upload_dir, safe_name), "wb") as f:
        f.write(content)

    thumbnail_path: Optional[str] = None
    mime = file.content_type or "application/octet-stream"
    if mime.startswith("image/"):
        try:
            from app.services import image_optimizer

            thumb_ext = os.path.splitext(safe_name)[1] or ".jpg"
            optimized_bytes, new_ext, _ = image_optimizer.optimize(
                content, thumb_ext, db
            )
            thumb_name = f"thumb_{uuid.uuid4().hex}{new_ext}"
            with open(os.path.join(upload_dir, thumb_name), "wb") as tf:
                tf.write(optimized_bytes)
            thumbnail_path = f"chat/{thumb_name}"
        except Exception:
            pass  # Thumbnail необязателен

    return f"chat/{safe_name}", thumbnail_path, mime


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

    content: bytes = await file.read()
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Файл слишком большой (макс. 10 МБ)")

    file_path_rel, thumbnail_path, mime = _persist_chat_file(db, file, content)

    attachment = MessageAttachmentModel(
        message_id=message_id,
        file_path=file_path_rel,
        file_name=file.filename or os.path.basename(file_path_rel),
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


@router.post(
    "/conversations/{conv_id}/messages/with-attachment",
    response_model=MessageResponse,
)
async def send_message_with_attachment(
    conv_id: int,
    file: UploadFile = File(...),
    text: Optional[str] = Form(None),
    reply_to_id: Optional[int] = Form(None),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Атомарно создать сообщение с вложением одним запросом.

    Заменяет двухшаговый «draft → upload»: при сбое не остаётся пустого
    сообщения-сироты, а получатель видит одно событие с готовым вложением.
    """
    chat_service._ensure_membership(db, conv_id, current_user.id)

    content: bytes = await file.read()
    if len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Файл слишком большой (макс. 10 МБ)")

    if reply_to_id:
        reply = (
            db.query(MessageModel)
            .filter(
                MessageModel.id == reply_to_id,
                MessageModel.conversation_id == conv_id,
            )
            .first()
        )
        if not reply:
            raise HTTPException(404, "Сообщение для ответа не найдено")

    file_path_rel, thumbnail_path, mime = _persist_chat_file(db, file, content)
    message_type = (
        MessageType.IMAGE.value if mime.startswith("image/") else MessageType.FILE.value
    )

    msg = MessageModel(
        conversation_id=conv_id,
        sender_id=current_user.id,
        text=text or None,
        message_type=message_type,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    db.flush()

    if text:
        chat_service._parse_and_create_mentions(db, msg.id, conv_id, text)

    db.add(
        MessageAttachmentModel(
            message_id=msg.id,
            file_path=file_path_rel,
            file_name=file.filename or os.path.basename(file_path_rel),
            file_size=len(content),
            mime_type=mime,
            thumbnail_path=thumbnail_path,
        )
    )

    conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()
    if conv:
        conv.last_message_at = msg.created_at

    db.commit()
    db.refresh(msg)

    result = chat_service._build_message_response(db, msg)
    member_ids = chat_service.get_conversation_member_ids(db, conv_id)

    # Push-уведомления оффлайн-участникам
    from app.services import send_push_notification

    notify_user_ids = [uid for uid in member_ids if uid != current_user.id]
    if notify_user_ids:
        title = (
            conv.name
            if conv and conv.name
            else (current_user.full_name or "Новое сообщение")
        )
        send_push_notification(
            title=title,
            body=text[:100] if text else "Вложение",
            notification_type="chat_message",
            task_id=conv.task_id if conv else None,
            user_ids=notify_user_ids,
            extra_data={"chat_id": str(conv_id)},
        )

    asyncio.ensure_future(
        broadcast_chat_message(
            member_user_ids=member_ids,
            conversation_id=conv_id,
            message_data={
                **result.model_dump(mode="json"),
                "conversation_name": conv.name if conv and conv.name else None,
            },
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
