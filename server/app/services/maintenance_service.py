"""Генерация плановых работ с транзакционной защитой от дублей."""

import calendar
import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AddressModel, OrganizationModel, TaskModel, UserModel
from app.models.operations import MaintenanceOccurrenceModel, MaintenancePlanModel
from app.schemas.task import TaskCreate
from app.services.business_time import business_tz
from app.services.notification_service import create_task_assignment_notification
from app.services.role_utils import org_managers
from app.services.task_service import TaskService

logger = logging.getLogger(__name__)


def following_date(plan: MaintenancePlanModel, current: date) -> date:
    if plan.frequency == "monthly":
        month = current.year * 12 + current.month - 1 + plan.interval
        year, month = divmod(month, 12)
        month += 1
        return date(
            year, month, min(plan.start_date.day, calendar.monthrange(year, month)[1])
        )
    return current + timedelta(
        days=plan.interval * (7 if plan.frequency == "weekly" else 1)
    )


def run_maintenance(db: Session, today: date | None = None) -> list[int]:
    from app.services.transactions import ensure_transaction

    ensure_transaction(db)
    today = today or datetime.now(business_tz()).date()
    plans = (
        db.query(MaintenancePlanModel)
        .filter(
            MaintenancePlanModel.enabled.is_(True),
            MaintenancePlanModel.next_date <= today,
        )
        .with_for_update(skip_locked=True)
        .all()
    )
    created = []
    for plan in plans:
        owner = db.get(UserModel, plan.created_by_id) if plan.created_by_id else None
        if owner is None or not owner.is_active:
            owner = next(iter(org_managers(db, plan.organization_id)), None)
        address = db.get(AddressModel, plan.address_id)
        if (
            not owner
            or not owner.is_active
            or not address
            or owner.organization_id != plan.organization_id
        ):
            continue
        # Ограниченный проход позволяет догнать длительный простой без большой транзакции.
        for _ in range(31):
            day = plan.next_date
            if day > today or (plan.end_date and day > plan.end_date):
                break
            if day.isoformat() in plan.excluded_dates:
                plan.next_date = following_date(plan, day)
                continue
            existing = (
                db.query(MaintenanceOccurrenceModel)
                .filter_by(plan_id=plan.id, scheduled_date=day)
                .first()
            )
            if not existing:
                org = (
                    db.get(OrganizationModel, plan.organization_id)
                    if plan.organization_id
                    else None
                )
                if org and not org.is_active:
                    break
                if (
                    org
                    and org.max_tasks
                    and db.query(TaskModel).filter_by(organization_id=org.id).count()
                    >= org.max_tasks
                ):
                    break
                try:
                    with db.begin_nested():
                        assigned = (
                            db.get(UserModel, plan.assigned_user_id)
                            if plan.assigned_user_id
                            else None
                        )
                        assigned_id = (
                            assigned.id
                            if assigned
                            and assigned.is_active
                            and assigned.organization_id == plan.organization_id
                            else None
                        )
                        task = TaskService(db).create(
                            TaskCreate(
                                title=plan.title,
                                address=address.address,
                                description=plan.description,
                                priority=plan.priority,
                                planned_date=datetime.combine(day, time(9)),
                                assigned_user_id=assigned_id,
                            ),
                            user=owner,
                        )
                        task.address_id = address.id
                        task.equipment_id = plan.equipment_id
                        db.add(
                            MaintenanceOccurrenceModel(
                                plan_id=plan.id, scheduled_date=day, task_id=task.id
                            )
                        )
                        if assigned_id:
                            create_task_assignment_notification(
                                db, task, assigned, owner, commit=False, send_push=True
                            )
                        db.flush()
                        created.append(task.id)
                except IntegrityError:
                    # Другой процесс уже создал то же вхождение. Остальные ошибки не скрываем.
                    if (
                        not db.query(MaintenanceOccurrenceModel)
                        .filter_by(plan_id=plan.id, scheduled_date=day)
                        .first()
                    ):
                        raise
            plan.next_date = following_date(plan, day)
        if plan.end_date and plan.next_date > plan.end_date:
            plan.enabled = False
    db.commit()
    return created
