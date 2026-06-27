"""
Chat API — messages
===================
Сообщения чата: список/отправка/редактирование/удаление/поиск, реакции
и отметки прочтения.
"""

import asyncio
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import assert_task_access
from app.models import UserModel, get_db
from app.models.chat import ConversationModel, MessageModel
from app.schemas.chat import (
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    MessageSearchRequest,
    MessageUpdate,
    ReactionCreate,
    ReactionInfo,
    ReadReceiptRequest,
)
from app.services import chat_service, get_current_user_required
from app.services.websocket_manager import (
    broadcast_chat_message,
    broadcast_chat_message_deleted,
    broadcast_chat_message_edited,
    broadcast_chat_reaction,
    broadcast_chat_read,
)

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.get("/conversations/{conv_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conv_id: int,
    before_id: Optional[int] = Query(
        None, description="Cursor: ID сообщения (загрузить старше)"
    ),
    after_id: Optional[int] = Query(
        None, description="Cursor: ID сообщения (catch-up, загрузить новее)"
    ),
    limit: int = Query(50, ge=1, le=100),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Сообщения чата с cursor-пагинацией."""
    return chat_service.get_messages(
        db, conv_id, current_user.id, before_id, after_id, limit
    )


@router.post("/conversations/{conv_id}/messages", response_model=MessageResponse)
async def send_message(
    conv_id: int,
    data: MessageCreate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Отправить сообщение."""
    # Проверка доступа к прикреплённой заявке (task_id приходит в теле, поэтому
    # path-зависимость require_task_access неприменима — используем assert_task_access).
    if data.task_id:
        assert_task_access(db, current_user, data.task_id)

    result = chat_service.send_message(
        db,
        conv_id,
        current_user.id,
        text=data.text,
        reply_to_id=data.reply_to_id,
        message_type=data.message_type,
        task_id=data.task_id,
    )

    # WebSocket broadcast
    member_ids = chat_service.get_conversation_member_ids(db, conv_id)
    conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()

    # Push notifications
    from app.services import send_push_notification

    notify_user_ids = [uid for uid in member_ids if uid != current_user.id]
    if notify_user_ids:
        title = (
            conv.name
            if conv and conv.name
            else (current_user.full_name or "Новое сообщение")
        )
        if data.task_id:
            body = "📋 Заявка"
        elif data.text:
            body = data.text[:100]
        else:
            body = "Вложение"

        send_push_notification(
            title=title,
            body=body,
            notification_type="chat_message",
            task_id=conv.task_id if conv else None,
            user_ids=notify_user_ids,
            extra_data={"chat_id": str(conv_id)},
        )

        # Web push (браузер): шлём всем не-замьютившим участникам — и оффлайн,
        # и онлайн. Решение «показывать ли уведомление» принимает service worker:
        # он подавляет пуш, если окно портала сейчас в фокусе (там виден тост),
        # и показывает, если портал свёрнут/не в фокусе/закрыт.
        from app.config import settings as _settings

        if _settings.web_push_enabled:
            from app.models.chat import ConversationMemberModel
            from app.services import send_web_push

            muted_ids = {
                row[0]
                for row in db.query(ConversationMemberModel.user_id)
                .filter(
                    ConversationMemberModel.conversation_id == conv_id,
                    ConversationMemberModel.is_muted.is_(True),
                )
                .all()
            }
            web_targets = [uid for uid in notify_user_ids if uid not in muted_ids]
            if web_targets:
                send_web_push(
                    title=title,
                    body=body,
                    url="/chat",
                    user_ids=web_targets,
                    extra_data={"chat_id": str(conv_id)},
                )

    # Упоминания → персистентные уведомления в колокольчик (не только toast).
    if result.mentions:
        from app.services.notification_service import create_notification

        chat_label = conv.name if conv and conv.name else "чате"
        snippet = (data.text or "")[:120]
        for mention in result.mentions:
            if mention.user_id == current_user.id:
                continue
            create_notification(
                db,
                user_id=mention.user_id,
                title=f"💬 Упоминание в {chat_label}",
                message=f"{current_user.full_name or current_user.username}: {snippet}",
                notification_type="system",
                conversation_id=conv_id,
            )

    # Полный MessageResponse в payload → клиент патчит кэш без рефетча истории.
    # conversation_name — доп. поле для пуш-тостов (вне схемы; Android игнорирует лишнее).
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


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: int,
    data: MessageUpdate,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Редактировать сообщение."""
    result = chat_service.edit_message(db, message_id, current_user.id, data.text)

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


@router.post("/messages/search", response_model=List[MessageResponse])
async def search_all_messages(
    data: MessageSearchRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Глобальный поиск по всем чатам пользователя."""
    return chat_service.search_all_messages(db, current_user.id, data.query)


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


@router.post("/conversations/{conv_id}/read")
async def mark_as_read(
    conv_id: int,
    data: ReadReceiptRequest,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Отметить сообщения как прочитанные."""
    chat_service.mark_as_read(db, conv_id, current_user.id, data.last_message_id)

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
