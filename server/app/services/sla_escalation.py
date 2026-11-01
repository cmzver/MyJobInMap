"""
SLA Escalation
==============
Напоминания о сроках заявок — периодическое задание (periodic_jobs):

=====================  ==========================================  =====================
Правило                Когда                                       Кому
=====================  ==========================================  =====================
unassigned             аварийная/срочная в NEW без исполнителя     менеджерам
                       дольше 15/30 мин
not_started            назначена, но в NEW дольше 30/60 мин        исполнителю
not_started_managers   то же дольше 60/120 мин                     менеджерам
due_soon               открыта, до срока меньше четверти           исполнителю и
                       норматива (от 1 до 24 ч)                    менеджерам
overdue                срок прошёл, заявка открыта                 менеджерам
=====================  ==========================================  =====================

Напоминание уходит один раз на правило и версию срока: ключ (заявка, правило,
срок) уникален в task_escalations. Перенос срока даёт новое напоминание,
повторный запуск задания — нет. События старше суток не напоминаются: давнюю
просрочку менеджеры видят в утреннем дайджесте, а включение функции не
вызывает шквала уведомлений по старым заявкам.

Уведомление в приложении создаётся всегда; пуши в тихие часы (22:00–08:00 по
BUSINESS_TIMEZONE) уходят только по аварийным заявкам.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import (
    JobRunModel,
    OrganizationModel,
    OrganizationSettingsModel,
    TaskEscalationModel,
    TaskModel,
    TaskStatus,
    UserModel,
)
from app.models.base import utcnow
from app.services.business_time import business_tz, to_naive_utc
from app.services.notification_service import (
    create_notification,
    notification_broadcast_payload,
)
from app.services.role_utils import org_managers
from app.services.sla_service import get_sla_hours_map
from app.utils import get_priority_display_name, normalize_priority_value

logger = logging.getLogger(__name__)

UNASSIGNED = "unassigned"
NOT_STARTED = "not_started"
NOT_STARTED_MANAGERS = "not_started_managers"
DUE_SOON = "due_soon"
OVERDUE = "overdue"

NOTIFICATION_TYPE = "sla"
STALE_AFTER = timedelta(hours=24)
UNASSIGNED_AFTER = {"EMERGENCY": timedelta(minutes=15), "URGENT": timedelta(minutes=30)}
NOT_STARTED_AFTER = {
    "EMERGENCY": timedelta(minutes=30),
    "URGENT": timedelta(minutes=60),
}
DUE_SOON_SHARE = 0.25
DUE_SOON_MIN = timedelta(hours=1)
DUE_SOON_MAX = timedelta(hours=24)
QUIET_HOURS = (22, 8)
# Дайджест просрочки — один раз в утреннее окно (позже не догоняем, чтобы
# перезапуск сервера днём не присылал «утренний» дайджест).
DIGEST_HOURS = (9, 12)

_OPEN = (TaskStatus.NEW.value, TaskStatus.IN_PROGRESS.value)
_MANAGER_RULES = {UNASSIGNED, NOT_STARTED_MANAGERS, DUE_SOON, OVERDUE}
_ASSIGNEE_RULES = {NOT_STARTED, DUE_SOON}
# Правила о начале работы привязаны ко времени создания, о сроке — к сроку.
_CREATED_AT_RULES = {UNASSIGNED, NOT_STARTED, NOT_STARTED_MANAGERS}

Payload = Tuple[int, dict]


def firing_rules(task, now: datetime, norm_hours: float) -> List[str]:
    """Какие правила сейчас выполняются для открытой заявки (без учёта отправленных)."""
    rules: List[str] = []
    priority = normalize_priority_value(task.priority)
    created = to_naive_utc(task.created_at) if task.created_at else None
    if task.status == TaskStatus.NEW.value and created and now - created <= STALE_AFTER:
        waited = now - created
        if task.assigned_user_id is None:
            if priority in UNASSIGNED_AFTER and waited >= UNASSIGNED_AFTER[priority]:
                rules.append(UNASSIGNED)
        elif priority in NOT_STARTED_AFTER:
            if waited >= NOT_STARTED_AFTER[priority]:
                rules.append(NOT_STARTED)
            if waited >= 2 * NOT_STARTED_AFTER[priority]:
                rules.append(NOT_STARTED_MANAGERS)

    if task.due_at is not None:
        due = to_naive_utc(task.due_at)
        if due <= now:
            if now - due <= STALE_AFTER:
                rules.append(OVERDUE)
        else:
            lead = timedelta(hours=norm_hours * DUE_SOON_SHARE)
            lead = min(max(lead, DUE_SOON_MIN), DUE_SOON_MAX)
            if due - now <= lead:
                rules.append(DUE_SOON)
    return rules


def is_quiet_time(now: datetime) -> bool:
    hour = now.replace(tzinfo=timezone.utc).astimezone(business_tz()).hour
    start, end = QUIET_HOURS
    return hour >= start or hour < end


def _local(moment: datetime) -> str:
    return (
        moment.replace(tzinfo=timezone.utc)
        .astimezone(business_tz())
        .strftime("%H:%M %d.%m")
    )


def _duration(delta: timedelta) -> str:
    minutes = int(delta.total_seconds() // 60)
    return f"{minutes} мин" if minutes < 120 else f"{minutes // 60} ч"


def _user_name(user: Optional[UserModel]) -> str:
    return (user.full_name or user.username) if user else "исполнителя"


def _text(rule: str, task: TaskModel, now: datetime) -> Tuple[str, str]:
    number = task.task_number or f"Z-{task.id:05d}"
    priority = get_priority_display_name(task.priority)
    waited = _duration(now - to_naive_utc(task.created_at)) if task.created_at else ""
    if rule == UNASSIGNED:
        return (
            "⏰ Заявка без исполнителя",
            f"№{number} ({priority}) ждёт исполнителя {waited}. {task.title}",
        )
    if rule == NOT_STARTED:
        return (
            "⏰ Заявка ждёт начала",
            f"№{number} ({priority}) ещё не в работе — прошло {waited}. {task.title}",
        )
    if rule == NOT_STARTED_MANAGERS:
        return (
            "⏰ Заявка не начата",
            f"№{number} ({priority}) у {_user_name(task.assigned_user)} "
            f"не в работе {waited}. {task.title}",
        )
    due = _local(to_naive_utc(task.due_at))
    if rule == DUE_SOON:
        return "⏳ Скоро срок заявки", f"№{number}: срок {due}. {task.title}"
    return "🔥 Заявка просрочена", f"№{number}: срок истёк {due}. {task.title}"


@dataclass
class _Outbox:
    now: datetime = field(default_factory=lambda: to_naive_utc(utcnow()))
    payloads: List[Payload] = field(default_factory=list)

    def notify(
        self,
        db: Session,
        users: Iterable[UserModel],
        title: str,
        body: str,
        task_id: Optional[int] = None,
        emergency: bool = False,
        url: Optional[str] = None,
    ) -> None:
        users = list(users)
        user_ids = []
        for user in users:
            notification = create_notification(
                db,
                user.id,
                title,
                body,
                NOTIFICATION_TYPE,
                task_id=task_id,
                commit=False,
                broadcast=False,
            )
            self.payloads.append(notification_broadcast_payload(notification))
            user_ids.append(user.id)
        if user_ids:
            from app.models.sla_calendar import SlaCalendarModel
            from app.services.sla_calendar import next_working_time

            org_id = users[0].organization_id
            calendar = db.get(SlaCalendarModel, org_id) if org_id is not None else None
            deferred = (
                next_working_time(calendar, self.now)
                if calendar and calendar.enabled and not emergency
                else None
            )
            if emergency or deferred is not None or not is_quiet_time(self.now):
                from app.services.outbox_service import stage_push

                stage_push(
                    db,
                    title=title,
                    body=body,
                    user_ids=user_ids,
                    task_id=task_id,
                    notification_type=NOTIFICATION_TYPE,
                    url=url,
                    organization_id=org_id,
                    not_before=deferred,
                )


def enabled_organization_ids(db: Session) -> List[int]:
    """Активные организации, где напоминания не выключены (нет строки — включены)."""
    rows = (
        db.query(
            OrganizationModel.id, OrganizationSettingsModel.sla_escalations_enabled
        )
        .outerjoin(
            OrganizationSettingsModel,
            OrganizationSettingsModel.organization_id == OrganizationModel.id,
        )
        .filter(OrganizationModel.is_active.is_(True))
        .all()
    )
    return [org_id for org_id, enabled in rows if enabled is not False]


def _claim(db: Session, entry: TaskEscalationModel) -> bool:
    """Записать напоминание; False — такое уже отправлено (в т.ч. параллельно)."""
    try:
        with db.begin_nested():
            db.add(entry)
        return True
    except IntegrityError:
        return False


def run_sla_tick(db: Session, now: Optional[datetime] = None) -> List[Payload]:
    """Разослать напоминания о сроках. Возвращает события для WebSocket."""
    from app.services.transactions import ensure_transaction

    ensure_transaction(db)
    now = to_naive_utc(now or utcnow())
    org_ids = enabled_organization_ids(db)
    if not org_ids:
        return []

    candidates = (
        db.query(TaskModel)
        .options(joinedload(TaskModel.assigned_user))
        .filter(
            TaskModel.organization_id.in_(org_ids),
            TaskModel.status.in_(_OPEN),
            or_(
                and_(
                    TaskModel.due_at >= now - STALE_AFTER,
                    TaskModel.due_at <= now + DUE_SOON_MAX,
                ),
                and_(
                    TaskModel.status == TaskStatus.NEW.value,
                    TaskModel.created_at >= now - STALE_AFTER,
                ),
            ),
        )
        .all()
    )
    if not candidates:
        return []

    sent: Set[Tuple[int, str, datetime]] = {
        (task_id, rule, snapshot)
        for task_id, rule, snapshot in db.query(
            TaskEscalationModel.task_id,
            TaskEscalationModel.rule,
            TaskEscalationModel.due_at_snapshot,
        ).filter(TaskEscalationModel.task_id.in_([t.id for t in candidates]))
    }
    norms: Dict[int, Dict[str, int]] = {}
    managers: Dict[int, List[UserModel]] = {}
    outbox = _Outbox(now=now)

    for task in candidates:
        org_id = task.organization_id
        if org_id not in norms:
            norms[org_id] = get_sla_hours_map(db, org_id)
        priority = normalize_priority_value(task.priority)
        for rule in firing_rules(task, now, norms[org_id].get(priority, 48)):
            snapshot = to_naive_utc(
                task.created_at if rule in _CREATED_AT_RULES else task.due_at
            )
            if (task.id, rule, snapshot) in sent:
                continue
            entry = TaskEscalationModel(
                task_id=task.id, rule=rule, due_at_snapshot=snapshot, sent_at=now
            )
            if not _claim(db, entry):
                continue

            recipients: Dict[int, UserModel] = {}
            if rule in _ASSIGNEE_RULES and task.assigned_user is not None:
                if task.assigned_user.is_active:
                    recipients[task.assigned_user.id] = task.assigned_user
            if rule in _MANAGER_RULES:
                if org_id not in managers:
                    managers[org_id] = org_managers(db, org_id)
                recipients.update({user.id: user for user in managers[org_id]})

            title, body = _text(rule, task, now)
            outbox.notify(
                db,
                recipients.values(),
                title,
                body,
                task_id=task.id,
                emergency=priority == "EMERGENCY",
            )

    db.commit()
    if outbox.payloads:
        logger.info("SLA: отправлено напоминаний — %d", len(outbox.payloads))
    return outbox.payloads


def run_overdue_digest(db: Session, now: Optional[datetime] = None) -> List[Payload]:
    """Утренний дайджест менеджерам: сколько открытых заявок просрочено."""
    from app.services.transactions import ensure_transaction

    ensure_transaction(db)
    now = to_naive_utc(now or utcnow())
    local = now.replace(tzinfo=timezone.utc).astimezone(business_tz())
    start, end = DIGEST_HOURS
    if not start <= local.hour < end:
        return []

    outbox = _Outbox(now=now)
    for org_id in enabled_organization_ids(db):
        run = JobRunModel(job="overdue_digest", run_key=f"{local.date()}:{org_id}")
        try:
            with db.begin_nested():
                db.add(run)
        except IntegrityError:
            continue
        overdue = (
            db.query(TaskModel)
            .filter(
                TaskModel.organization_id == org_id,
                TaskModel.status.in_(_OPEN),
                TaskModel.due_at < now,
            )
            .count()
        )
        if overdue:
            outbox.notify(
                db,
                org_managers(db, org_id),
                f"🔥 Просрочено заявок: {overdue}",
                "Открытые заявки с истёкшим сроком — в списке заявок, фильтр "
                "«Срок: просрочены».",
                url="/tasks?due=overdue",
            )

    db.commit()
    return outbox.payloads
