"""
Escalation Models
=================
Журнал напоминаний о сроках и отметки периодических заданий.

Уникальные ключи — защита от повторной отправки: задание можно запускать
сколько угодно раз (и в нескольких процессах), напоминание уйдёт один раз.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class TaskEscalationModel(Base):
    """Отправленное напоминание: одно на заявку, правило и версию срока."""

    __tablename__ = "task_escalations"
    __table_args__ = (
        UniqueConstraint(
            "task_id", "rule", "due_at_snapshot", name="uq_task_escalations_rule"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rule: Mapped[str] = mapped_column(String(32), nullable=False)
    # Срок (или время создания — для правил «нет исполнителя», «не начата»), к
    # которому относится напоминание: перенос срока даёт новое напоминание.
    due_at_snapshot: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class JobRunModel(Base):
    """Выполненный запуск задания по ключу: «дайджест за 2026-11-02, орг. 5»."""

    __tablename__ = "job_runs"

    job: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )
