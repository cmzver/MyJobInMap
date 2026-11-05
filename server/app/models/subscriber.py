"""Подписки заявителя на уведомления о заявке (Telegram)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class TaskSubscriberModel(Base):
    __tablename__ = "task_subscribers"
    __table_args__ = (
        UniqueConstraint("task_id", "channel", "address", name="uq_task_subscriber"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # telegram — address = chat_id
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    address: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
