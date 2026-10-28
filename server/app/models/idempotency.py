"""
Idempotency Models
==================
Сохранённые ответы на запросы с заголовком ``Idempotency-Key``.

Android-outbox повторяет операцию, если HTTP-ответ потерялся. Без ключа такой
повтор создаёт второй комментарий или падает на «недопустимом переходе»
статуса, хотя первая попытка уже применилась.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class IdempotencyKeyModel(Base):
    """Ответ на операцию, выполненную с данным ключом (на пользователя)."""

    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_idempotency_keys_user_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(64), nullable=False)
    # Операция и её цель (например, "comment:42") — ключ нельзя переиспользовать
    # для другой операции.
    scope: Mapped[str] = mapped_column(String(64), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    response_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False, index=True
    )
