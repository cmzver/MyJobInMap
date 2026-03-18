"""
Chat Service
=============
Бизнес-логика чата: разговоры, сообщения, реакции, прочтение.
"""

import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, and_
from sqlalchemy.orm import Session, joinedload

from app.models import UserModel
from app.models.chat import (
    ConversationType,
    ConversationMemberRole,
    MessageType,
    ConversationModel,
    ConversationMemberModel,
    MessageModel,
    MessageAttachmentModel,
    MessageReactionModel,
    MessageMentionModel,
)
from app.schemas.chat import (
    ConversationListItem,
    ConversationDetailResponse,
    LastMessagePreview,
    MemberInfo,
    MessageResponse,
    MessageListResponse,
    AttachmentResponse,
    ReactionInfo,
    MentionInfo,
    ReplyPreview,
)
from app.utils import build_user_avatar_url

logger = logging.getLogger(__name__)


# ============================================================================
# Conversations
# ============================================================================


def create_conversation(
    db: Session,
    conv_type: str,
    creator_id: int,
    organization_id: Optional[int],
    name: Optional[str] = None,
    task_id: Optional[int] = None,
    member_user_ids: Optional[list[int]] = None,
) -> ConversationModel:
    """Создать разговор с валидацией типа."""
    member_user_ids = member_user_ids or []

    # Валидация типа
    if conv_type == ConversationType.DIRECT.value:
        if len(member_user_ids) != 1:
            raise HTTPException(400, "Direct-чат требует ровно 1 ID собеседника")
        other_id = member_user_ids[0]
        if other_id == creator_id:
            raise HTTPException(400, "Нельзя создать чат с самим собой")
        # Проверка: пользователи в одной организации
        other = db.query(UserModel).filter(UserModel.id == other_id, UserModel.is_active == True).first()  # noqa: E712
        if not other:
            raise HTTPException(404, "Пользователь не найден")
        # Idempotent: проверяем существующий direct-чат
        existing = _find_direct_conversation(db, creator_id, other_id)
        if existing:
            return existing

    elif conv_type == ConversationType.TASK.value:
        if not task_id:
            raise HTTPException(400, "task_id обязателен для чата по заявке")
        existing = db.query(ConversationModel).filter(
            ConversationModel.type == ConversationType.TASK.value,
            ConversationModel.task_id == task_id,
        ).first()
        if existing:
            return existing

    elif conv_type == ConversationType.ORG_GENERAL.value:
        if not organization_id:
            raise HTTPException(400, "organization_id обязателен для общего чата")
        existing = db.query(ConversationModel).filter(
            ConversationModel.type == ConversationType.ORG_GENERAL.value,
            ConversationModel.organization_id == organization_id,
        ).first()
        if existing:
            return existing

    elif conv_type == ConversationType.GROUP.value:
        if not name:
            raise HTTPException(400, "Название обязательно для группового чата")
    else:
        raise HTTPException(400, f"Неизвестный тип чата: {conv_type}")

    conv = ConversationModel(
        type=conv_type,
        name=name,
        task_id=task_id,
        organization_id=organization_id,
        created_by=creator_id,
    )
    db.add(conv)
    db.flush()

    # Добавляем создателя как owner
    db.add(ConversationMemberModel(
        conversation_id=conv.id,
        user_id=creator_id,
        role=ConversationMemberRole.OWNER.value,
    ))

    # Добавляем участников
    for uid in member_user_ids:
        if uid == creator_id:
            continue
        user = db.query(UserModel).filter(UserModel.id == uid, UserModel.is_active == True).first()  # noqa: E712
        if user:
            db.add(ConversationMemberModel(
                conversation_id=conv.id,
                user_id=uid,
                role=ConversationMemberRole.MEMBER.value,
            ))

    db.commit()
    db.refresh(conv)
    return conv


def _find_direct_conversation(
    db: Session, user1_id: int, user2_id: int,
) -> Optional[ConversationModel]:
    """Найти существующий direct-чат между двумя пользователями."""
    conv_ids_1 = db.query(ConversationMemberModel.conversation_id).filter(
        ConversationMemberModel.user_id == user1_id,
    ).scalar_subquery()
    conv_ids_2 = db.query(ConversationMemberModel.conversation_id).filter(
        ConversationMemberModel.user_id == user2_id,
    ).scalar_subquery()

    return db.query(ConversationModel).filter(
        ConversationModel.type == ConversationType.DIRECT.value,
        ConversationModel.id.in_(conv_ids_1),
        ConversationModel.id.in_(conv_ids_2),
    ).first()


def get_user_conversations(
    db: Session,
    user_id: int,
    organization_id: Optional[int],
    is_superadmin: bool = False,
    include_archived: bool = False,
) -> list[ConversationListItem]:
    """Получить список чатов пользователя с unread_count и last_message."""
    # Подзапрос: conversation_ids пользователя
    member_q = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.user_id == user_id,
    )
    if not include_archived:
        member_q = member_q.filter(ConversationMemberModel.is_archived == False)  # noqa: E712
    members = member_q.all()

    member_map = {m.conversation_id: m for m in members}
    conv_ids = list(member_map.keys())

    if not conv_ids:
        return []

    conversations = db.query(ConversationModel).filter(
        ConversationModel.id.in_(conv_ids),
    ).order_by(ConversationModel.last_message_at.desc().nullslast()).all()

    result: list[ConversationListItem] = []
    for conv in conversations:
        member = member_map[conv.id]
        conversation_avatar_url = conv.avatar_url

        # Last message
        last_msg = db.query(MessageModel).filter(
            MessageModel.conversation_id == conv.id,
            MessageModel.is_deleted == False,  # noqa: E712
        ).order_by(MessageModel.created_at.desc()).first()

        last_message_preview = None
        if last_msg:
            sender = db.query(UserModel).filter(UserModel.id == last_msg.sender_id).first()
            text_preview = last_msg.text
            if text_preview and len(text_preview) > 100:
                text_preview = text_preview[:100] + "…"
            last_message_preview = LastMessagePreview(
                id=last_msg.id,
                text=text_preview if not last_msg.is_deleted else None,
                sender_name=sender.full_name or sender.username if sender else "?",
                message_type=last_msg.message_type,
                created_at=last_msg.created_at,
            )

        # Unread count
        unread_q = db.query(func.count(MessageModel.id)).filter(
            MessageModel.conversation_id == conv.id,
            MessageModel.is_deleted == False,  # noqa: E712
            MessageModel.sender_id != user_id,
        )
        if member.last_read_message_id:
            unread_q = unread_q.filter(MessageModel.id > member.last_read_message_id)
        unread_count = unread_q.scalar() or 0

        unread_mentions_q = db.query(func.count(MessageMentionModel.id)).join(
            MessageModel,
            MessageModel.id == MessageMentionModel.message_id,
        ).filter(
            MessageModel.conversation_id == conv.id,
            MessageModel.is_deleted == False,  # noqa: E712
            MessageModel.sender_id != user_id,
            MessageMentionModel.user_id == user_id,
        )
        if member.last_read_message_id:
            unread_mentions_q = unread_mentions_q.filter(MessageModel.id > member.last_read_message_id)
        unread_mention_count = unread_mentions_q.scalar() or 0

        # Название для direct-чатов — имя собеседника
        display_name = conv.name
        if conv.type == ConversationType.DIRECT.value:
            other_member = db.query(ConversationMemberModel).filter(
                ConversationMemberModel.conversation_id == conv.id,
                ConversationMemberModel.user_id != user_id,
            ).first()
            if other_member:
                other_user = db.query(UserModel).filter(UserModel.id == other_member.user_id).first()
                if other_user:
                    display_name = other_user.full_name or other_user.username
                    conversation_avatar_url = build_user_avatar_url(other_user)

        result.append(ConversationListItem(
            id=conv.id,
            type=conv.type,
            name=display_name,
            avatar_url=conversation_avatar_url,
            task_id=conv.task_id,
            last_message=last_message_preview,
            unread_count=unread_count,
            unread_mention_count=unread_mention_count,
            is_muted=member.is_muted,
            is_archived=member.is_archived,
            updated_at=conv.last_message_at or conv.created_at,
        ))

    return result


def get_conversation_detail(
    db: Session, conv_id: int, user_id: int,
) -> ConversationDetailResponse:
    """Получить детали чата с участниками. Проверяет membership."""
    conv = _get_conversation_or_404(db, conv_id)
    _ensure_membership(db, conv_id, user_id)

    members_data = _get_members_info(db, conv_id)

    return ConversationDetailResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        task_id=conv.task_id,
        organization_id=conv.organization_id,
        created_by=conv.created_by,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        members=members_data,
    )


def update_conversation(
    db: Session, conv_id: int, user_id: int,
    name: Optional[str] = None, avatar_url: Optional[str] = None,
) -> ConversationModel:
    """Обновить название / аватар чата."""
    conv = _get_conversation_or_404(db, conv_id)
    member = _ensure_membership(db, conv_id, user_id)

    if conv.type == ConversationType.DIRECT.value:
        raise HTTPException(400, "Нельзя менять настройки direct-чата")

    if name is not None and name != conv.name:
        conv.name = name
        _create_system_message(
            db,
            conv_id,
            user_id,
            f"переименовал(а) чат в \"{name}\"",
        )
    if avatar_url is not None:
        conv.avatar_url = avatar_url

    db.commit()
    db.refresh(conv)
    return conv


def add_members(
    db: Session, conv_id: int, user_ids: list[int], added_by: int,
) -> list[MemberInfo]:
    """Добавить участников в groupовой или org_general чат."""
    conv = _get_conversation_or_404(db, conv_id)
    _ensure_membership(db, conv_id, added_by)

    if conv.type == ConversationType.DIRECT.value:
        raise HTTPException(400, "Нельзя добавлять участников в direct-чат")

    for uid in user_ids:
        existing = db.query(ConversationMemberModel).filter(
            ConversationMemberModel.conversation_id == conv_id,
            ConversationMemberModel.user_id == uid,
        ).first()
        if existing:
            continue
        user = db.query(UserModel).filter(UserModel.id == uid, UserModel.is_active == True).first()  # noqa: E712
        if user:
            db.add(ConversationMemberModel(
                conversation_id=conv_id,
                user_id=uid,
                role=ConversationMemberRole.MEMBER.value,
            ))
            # Системное сообщение
            _create_system_message(
                db, conv_id, added_by,
                f"добавил(а) {user.full_name or user.username} в чат",
            )

    db.commit()
    return _get_members_info(db, conv_id)


def remove_member(
    db: Session, conv_id: int, target_user_id: int, removed_by: int,
) -> None:
    """Удалить участника из чата."""
    conv = _get_conversation_or_404(db, conv_id)

    if conv.type == ConversationType.DIRECT.value:
        raise HTTPException(400, "Нельзя удалять участников из direct-чата")

    remover = _ensure_membership(db, conv_id, removed_by)
    target = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.conversation_id == conv_id,
        ConversationMemberModel.user_id == target_user_id,
    ).first()
    if not target:
        raise HTTPException(404, "Участник не найден в чате")
    if target.role == ConversationMemberRole.OWNER.value:
        raise HTTPException(400, "Сначала передайте ownership другому участнику")

    # Только owner/admin может удалять, или пользователь сам выходит
    if target_user_id != removed_by and remover.role not in (
        ConversationMemberRole.OWNER.value,
        ConversationMemberRole.ADMIN.value,
    ):
        raise HTTPException(403, "Нет прав для удаления участника")

    user = db.query(UserModel).filter(UserModel.id == target_user_id).first()
    db.delete(target)

    _create_system_message(
        db, conv_id, removed_by,
        f"{'вышел(а) из чата' if target_user_id == removed_by else f'удалил(а) {user.full_name or user.username if user else target_user_id} из чата'}",
    )
    db.commit()


def update_member_role(
    db: Session,
    conv_id: int,
    target_user_id: int,
    new_role: str,
    changed_by: int,
) -> list[MemberInfo]:
    """Изменить роль участника. Только owner может переключать admin/member."""
    conv = _get_conversation_or_404(db, conv_id)
    if conv.type == ConversationType.DIRECT.value:
        raise HTTPException(400, "Нельзя менять роли в direct-чате")

    actor = _ensure_membership(db, conv_id, changed_by)
    if actor.role != ConversationMemberRole.OWNER.value:
        raise HTTPException(403, "Только owner может менять роли участников")

    if new_role not in (ConversationMemberRole.ADMIN.value, ConversationMemberRole.MEMBER.value):
        raise HTTPException(400, "Допустимы только роли admin и member")

    if target_user_id == changed_by:
        raise HTTPException(400, "Нельзя менять собственную роль")

    target = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.conversation_id == conv_id,
        ConversationMemberModel.user_id == target_user_id,
    ).first()
    if not target:
        raise HTTPException(404, "Участник не найден в чате")

    if target.role == ConversationMemberRole.OWNER.value:
        raise HTTPException(400, "Нельзя менять роль владельца чата")
    if target.role == new_role:
        return _get_members_info(db, conv_id)

    user = db.query(UserModel).filter(UserModel.id == target_user_id).first()
    target.role = new_role
    _create_system_message(
        db,
        conv_id,
        changed_by,
        f"изменил(а) роль {user.full_name or user.username if user else target_user_id} на {new_role}",
    )
    db.commit()
    return _get_members_info(db, conv_id)


def transfer_ownership(
    db: Session,
    conv_id: int,
    target_user_id: int,
    changed_by: int,
) -> list[MemberInfo]:
    """Передать ownership другому участнику чата."""
    conv = _get_conversation_or_404(db, conv_id)
    if conv.type == ConversationType.DIRECT.value:
        raise HTTPException(400, "Нельзя передавать ownership в direct-чате")

    actor = _ensure_membership(db, conv_id, changed_by)
    if actor.role != ConversationMemberRole.OWNER.value:
        raise HTTPException(403, "Только owner может передавать ownership")

    if target_user_id == changed_by:
        raise HTTPException(400, "Нельзя передать ownership самому себе")

    target = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.conversation_id == conv_id,
        ConversationMemberModel.user_id == target_user_id,
    ).first()
    if not target:
        raise HTTPException(404, "Участник не найден в чате")
    if target.role == ConversationMemberRole.OWNER.value:
        return _get_members_info(db, conv_id)

    actor.role = ConversationMemberRole.ADMIN.value
    target.role = ConversationMemberRole.OWNER.value

    user = db.query(UserModel).filter(UserModel.id == target_user_id).first()
    _create_system_message(
        db,
        conv_id,
        changed_by,
        f"передал(а) ownership пользователю {user.full_name or user.username if user else target_user_id}",
    )
    db.commit()
    return _get_members_info(db, conv_id)


def mute_conversation(
    db: Session, conv_id: int, user_id: int, is_muted: bool,
) -> None:
    """Mute / unmute чата для пользователя."""
    member = _ensure_membership(db, conv_id, user_id)
    member.is_muted = is_muted
    db.commit()


def archive_conversation(
    db: Session, conv_id: int, user_id: int, is_archived: bool,
) -> None:
    """Archive / unarchive чата для пользователя."""
    member = _ensure_membership(db, conv_id, user_id)
    member.is_archived = is_archived
    db.commit()


def get_or_create_task_conversation(
    db: Session, task_id: int, user_id: int, organization_id: Optional[int],
) -> ConversationModel:
    """Получить или создать чат заявки."""
    # Validate task exists
    from app.models.task import TaskModel
    task = db.query(TaskModel).filter(TaskModel.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Validate organization_id matches task's organization if provided
    if organization_id is not None and task.organization_id != organization_id:
        raise HTTPException(status_code=400, detail="Organization ID does not match task's organization")
    
    # Use task's organization_id if not provided
    if organization_id is None:
        organization_id = task.organization_id
    
    existing = db.query(ConversationModel).filter(
        ConversationModel.type == ConversationType.TASK.value,
        ConversationModel.task_id == task_id,
    ).first()
    if existing:
        # Убедимся что пользователь участник
        member = db.query(ConversationMemberModel).filter(
            ConversationMemberModel.conversation_id == existing.id,
            ConversationMemberModel.user_id == user_id,
        ).first()
        if not member:
            db.add(ConversationMemberModel(
                conversation_id=existing.id,
                user_id=user_id,
                role=ConversationMemberRole.MEMBER.value,
            ))
            db.commit()
        return existing

    return create_conversation(
        db, ConversationType.TASK.value, user_id, organization_id,
        task_id=task_id,
    )


# ============================================================================
# Messages
# ============================================================================


def send_message(
    db: Session,
    conv_id: int,
    sender_id: int,
    text: Optional[str] = None,
    reply_to_id: Optional[int] = None,
    message_type: str = MessageType.TEXT.value,
) -> MessageResponse:
    """Отправить сообщение в чат."""
    _ensure_membership(db, conv_id, sender_id)

    if not text and message_type == MessageType.TEXT.value:
        raise HTTPException(400, "Текст сообщения обязателен")

    if reply_to_id:
        reply = db.query(MessageModel).filter(
            MessageModel.id == reply_to_id,
            MessageModel.conversation_id == conv_id,
        ).first()
        if not reply:
            raise HTTPException(404, "Сообщение для ответа не найдено")

    msg = MessageModel(
        conversation_id=conv_id,
        sender_id=sender_id,
        text=text,
        message_type=message_type,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    db.flush()

    # Parse @mentions
    if text:
        _parse_and_create_mentions(db, msg.id, conv_id, text)

    # Update conversation last_message_at
    conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()
    if conv:
        conv.last_message_at = msg.created_at

    db.commit()
    db.refresh(msg)

    return _build_message_response(db, msg)


def get_messages(
    db: Session,
    conv_id: int,
    user_id: int,
    before_id: Optional[int] = None,
    limit: int = 50,
) -> MessageListResponse:
    """Получить сообщения чата с cursor-пагинацией."""
    _ensure_membership(db, conv_id, user_id)

    query = db.query(MessageModel).filter(
        MessageModel.conversation_id == conv_id,
    )

    if before_id:
        query = query.filter(MessageModel.id < before_id)

    # +1 для определения has_more
    messages = query.order_by(MessageModel.id.desc()).limit(limit + 1).all()

    has_more = len(messages) > limit
    if has_more:
        messages = messages[:limit]

    items = [_build_message_response(db, m) for m in reversed(messages)]

    return MessageListResponse(items=items, has_more=has_more)


def edit_message(
    db: Session, message_id: int, user_id: int, new_text: str,
) -> MessageResponse:
    """Редактировать своё сообщение (до 24 часов)."""
    msg = db.query(MessageModel).filter(MessageModel.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Сообщение не найдено")
    if msg.sender_id != user_id:
        raise HTTPException(403, "Можно редактировать только свои сообщения")
    if msg.is_deleted:
        raise HTTPException(400, "Сообщение удалено")

    age = datetime.now(timezone.utc) - msg.created_at.replace(tzinfo=timezone.utc)
    if age > timedelta(hours=24):
        raise HTTPException(400, "Редактирование возможно только в течение 24 часов")

    msg.text = new_text
    msg.is_edited = True
    msg.edited_at = datetime.now(timezone.utc)

    # Пересоздать mentions
    db.query(MessageMentionModel).filter(MessageMentionModel.message_id == message_id).delete()
    _parse_and_create_mentions(db, message_id, msg.conversation_id, new_text)

    db.commit()
    db.refresh(msg)
    return _build_message_response(db, msg)


def delete_message(
    db: Session, message_id: int, user_id: int,
) -> None:
    """Soft delete сообщения."""
    msg = db.query(MessageModel).filter(MessageModel.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Сообщение не найдено")

    # Свои сообщения или admin/owner чата
    if msg.sender_id != user_id:
        member = db.query(ConversationMemberModel).filter(
            ConversationMemberModel.conversation_id == msg.conversation_id,
            ConversationMemberModel.user_id == user_id,
        ).first()
        if not member or member.role not in (
            ConversationMemberRole.OWNER.value,
            ConversationMemberRole.ADMIN.value,
        ):
            raise HTTPException(403, "Нет прав для удаления")

    msg.is_deleted = True
    msg.text = None  # Удаляем содержимое
    db.commit()


def search_messages(
    db: Session,
    conv_id: int,
    user_id: int,
    query_text: str,
    limit: int = 50,
) -> list[MessageResponse]:
    """Поиск по тексту сообщений в чате."""
    _ensure_membership(db, conv_id, user_id)

    pattern = f"%{query_text}%"
    messages = db.query(MessageModel).filter(
        MessageModel.conversation_id == conv_id,
        MessageModel.is_deleted == False,  # noqa: E712
        MessageModel.text.ilike(pattern),
    ).order_by(MessageModel.created_at.desc()).limit(limit).all()

    return [_build_message_response(db, m) for m in messages]


# ============================================================================
# Reactions
# ============================================================================


def toggle_reaction(
    db: Session, message_id: int, user_id: int, emoji: str,
) -> list[ReactionInfo]:
    """Add/remove реакцию. Возвращает обновлённый список реакций."""
    msg = db.query(MessageModel).filter(MessageModel.id == message_id).first()
    if not msg:
        raise HTTPException(404, "Сообщение не найдено")
    _ensure_membership(db, msg.conversation_id, user_id)

    existing = db.query(MessageReactionModel).filter(
        MessageReactionModel.message_id == message_id,
        MessageReactionModel.user_id == user_id,
        MessageReactionModel.emoji == emoji,
    ).first()

    if existing:
        db.delete(existing)
    else:
        db.add(MessageReactionModel(
            message_id=message_id,
            user_id=user_id,
            emoji=emoji,
        ))

    db.commit()
    return _get_reactions(db, message_id)


# ============================================================================
# Read Receipts
# ============================================================================


def mark_as_read(
    db: Session, conv_id: int, user_id: int, last_message_id: int,
) -> None:
    """Отметить сообщения как прочитанные до указанного ID."""
    member = _ensure_membership(db, conv_id, user_id)

    # Только increment — нельзя уменьшить прочитанное
    if member.last_read_message_id is None or last_message_id > member.last_read_message_id:
        member.last_read_message_id = last_message_id
        db.commit()


def get_unread_counts(
    db: Session, user_id: int,
) -> dict[int, int]:
    """Получить количество непрочитанных для всех чатов пользователя."""
    members = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.user_id == user_id,
        ConversationMemberModel.is_archived == False,  # noqa: E712
    ).all()

    result: dict[int, int] = {}
    for m in members:
        q = db.query(func.count(MessageModel.id)).filter(
            MessageModel.conversation_id == m.conversation_id,
            MessageModel.is_deleted == False,  # noqa: E712
            MessageModel.sender_id != user_id,
        )
        if m.last_read_message_id:
            q = q.filter(MessageModel.id > m.last_read_message_id)
        result[m.conversation_id] = q.scalar() or 0

    return result


# ============================================================================
# Helpers
# ============================================================================


def get_conversation_member_ids(db: Session, conv_id: int) -> list[int]:
    """Получить список user_id всех участников чата."""
    rows = db.query(ConversationMemberModel.user_id).filter(
        ConversationMemberModel.conversation_id == conv_id,
    ).all()
    return [r[0] for r in rows]


def _get_conversation_or_404(db: Session, conv_id: int) -> ConversationModel:
    conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Чат не найден")
    return conv


def _ensure_membership(
    db: Session, conv_id: int, user_id: int,
) -> ConversationMemberModel:
    """Проверить что пользователь — участник чата."""
    member = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.conversation_id == conv_id,
        ConversationMemberModel.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(403, "Вы не участник этого чата")
    return member


def _get_members_info(db: Session, conv_id: int) -> list[MemberInfo]:
    members = db.query(ConversationMemberModel).filter(
        ConversationMemberModel.conversation_id == conv_id,
    ).all()

    result = []
    for m in members:
        user = db.query(UserModel).filter(UserModel.id == m.user_id).first()
        if user:
            result.append(MemberInfo(
                user_id=user.id,
                username=user.username,
                full_name=user.full_name or user.username,
                avatar_url=build_user_avatar_url(user),
                role=m.role,
                last_read_message_id=m.last_read_message_id,
                is_muted=m.is_muted,
                is_archived=m.is_archived,
                joined_at=m.joined_at,
            ))
    return result


def _create_system_message(
    db: Session, conv_id: int, sender_id: int, text: str,
) -> MessageModel:
    """Создать системное сообщение."""
    msg = MessageModel(
        conversation_id=conv_id,
        sender_id=sender_id,
        text=text,
        message_type=MessageType.SYSTEM.value,
    )
    db.add(msg)
    db.flush()

    conv = db.query(ConversationModel).filter(ConversationModel.id == conv_id).first()
    if conv:
        conv.last_message_at = msg.created_at

    return msg


def _parse_and_create_mentions(
    db: Session, message_id: int, conv_id: int, text: str,
) -> None:
    """Распарсить @username из текста и создать MentionModel записи."""
    # Формат: @username
    pattern = r"@(\w+)"
    for match in re.finditer(pattern, text):
        username = match.group(1)
        user = db.query(UserModel).filter(UserModel.username == username).first()
        if user:
            # Проверить что пользователь — участник чата
            is_member = db.query(ConversationMemberModel).filter(
                ConversationMemberModel.conversation_id == conv_id,
                ConversationMemberModel.user_id == user.id,
            ).first()
            if is_member:
                db.add(MessageMentionModel(
                    message_id=message_id,
                    user_id=user.id,
                    offset=match.start(),
                    length=len(match.group(0)),
                ))


def _get_reactions(db: Session, message_id: int) -> list[ReactionInfo]:
    """Получить сгруппированные реакции."""
    reactions = db.query(MessageReactionModel).filter(
        MessageReactionModel.message_id == message_id,
    ).all()

    grouped: dict[str, ReactionInfo] = {}
    for r in reactions:
        if r.emoji not in grouped:
            grouped[r.emoji] = ReactionInfo(emoji=r.emoji, count=0, user_ids=[], user_names=[])
        info = grouped[r.emoji]
        info.count += 1
        info.user_ids.append(r.user_id)
        user = db.query(UserModel).filter(UserModel.id == r.user_id).first()
        if user:
            info.user_names.append(user.full_name or user.username)

    return list(grouped.values())


def _build_message_response(db: Session, msg: MessageModel) -> MessageResponse:
    """Построить MessageResponse из модели."""
    sender = db.query(UserModel).filter(UserModel.id == msg.sender_id).first()

    # Reply preview
    reply_preview = None
    if msg.reply_to_id and not msg.is_deleted:
        reply_msg = db.query(MessageModel).filter(MessageModel.id == msg.reply_to_id).first()
        if reply_msg:
            reply_sender = db.query(UserModel).filter(UserModel.id == reply_msg.sender_id).first()
            reply_text = reply_msg.text
            if reply_text and len(reply_text) > 100:
                reply_text = reply_text[:100] + "…"
            reply_preview = ReplyPreview(
                id=reply_msg.id,
                text=reply_text if not reply_msg.is_deleted else None,
                sender_id=reply_msg.sender_id,
                sender_name=reply_sender.full_name or reply_sender.username if reply_sender else "?",
            )

    # Attachments
    attachments = []
    if not msg.is_deleted:
        atts = db.query(MessageAttachmentModel).filter(
            MessageAttachmentModel.message_id == msg.id,
        ).all()
        attachments = [
            AttachmentResponse(
                id=a.id,
                file_name=a.file_name,
                file_path=a.file_path,
                file_size=a.file_size,
                mime_type=a.mime_type,
                thumbnail_path=a.thumbnail_path,
            ) for a in atts
        ]

    # Reactions
    reactions = _get_reactions(db, msg.id) if not msg.is_deleted else []

    # Mentions
    mentions = []
    if not msg.is_deleted:
        mention_models = db.query(MessageMentionModel).filter(
            MessageMentionModel.message_id == msg.id,
        ).all()
        for mm in mention_models:
            user = db.query(UserModel).filter(UserModel.id == mm.user_id).first()
            if user:
                mentions.append(MentionInfo(
                    user_id=user.id,
                    username=user.username,
                    offset=mm.offset,
                    length=mm.length,
                ))

    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        sender_name=sender.full_name or sender.username if sender else "?",
        sender_username=sender.username if sender else "?",
        text=msg.text if not msg.is_deleted else None,
        message_type=msg.message_type,
        reply_to=reply_preview,
        attachments=attachments,
        reactions=reactions,
        mentions=mentions,
        is_edited=msg.is_edited,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
        edited_at=msg.edited_at,
    )
