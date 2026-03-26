"""
Task Service
============
Бизнес-логика для работы с заявками.

Централизует логику создания, обновления, валидации заявок.
Упрощает тестирование и переиспользование кода.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (CommentModel, TaskModel, TaskStatus, UserModel,
                        UserRole, get_db)
from app.models.address import AddressModel
from app.schemas import TaskCreate, TaskStatusUpdate
from app.services.address_parser import parse_address
from app.services.geocoding import geocoding_service
from app.services.notification_service import (
    create_task_assignment_notification, create_task_status_notification)
from app.services.push import send_push_notification
from app.services.task_state_machine import TaskStatusMachine
from app.services.tenant_filter import TenantFilter
from app.utils import (get_priority_display_name, get_priority_rank,
                       get_status_comment_required_message,
                       get_status_display_name, normalize_priority_value,
                       priority_rank_expr)


class TaskServiceError(Exception):
    """Базовое исключение сервиса заявок"""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class TaskNotFoundError(TaskServiceError):
    """Заявка не найдена"""

    def __init__(self, task_id: int):
        super().__init__(f"Заявка #{task_id} не найдена", 404)


class PermissionDeniedError(TaskServiceError):
    """Нет доступа"""

    def __init__(self, message: str = "Нет доступа"):
        super().__init__(message, 403)


class InvalidTransitionError(TaskServiceError):
    """Недопустимый переход статуса"""

    def __init__(self, from_status: str, to_status: str):
        valid = TaskStatusMachine.get_valid_transitions(from_status)
        super().__init__(
            f"Невозможен переход {from_status} → {to_status}. Допустимые: {valid}", 422
        )


class CommentRequiredError(TaskServiceError):
    """Для перехода статуса требуется комментарий"""

    def __init__(self, to_status: str):
        super().__init__(get_status_comment_required_message(to_status), 422)


logger = logging.getLogger(__name__)
COORDINATE_PLACEHOLDER_EPSILON = 0.000001


def has_valid_task_coordinates(lat: Optional[float], lon: Optional[float]) -> bool:
    if lat is None or lon is None:
        return False
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return False
    if abs(lat) < COORDINATE_PLACEHOLDER_EPSILON and abs(lon) < COORDINATE_PLACEHOLDER_EPSILON:
        return False
    return True


def _string_match_score(left: Optional[str], right: Optional[str]) -> int:
    if not left or not right:
        return 0

    normalized_left = left.strip().lower()
    normalized_right = right.strip().lower()
    if not normalized_left or not normalized_right:
        return 0
    if normalized_left == normalized_right:
        return 18
    if normalized_left in normalized_right or normalized_right in normalized_left:
        return 10
    return 0


class TaskService:
    """
    Сервис для работы с заявками.

    Инкапсулирует бизнес-логику:
    - Создание с геокодированием и извлечением приоритета
    - Изменение статуса с валидацией state machine
    - Назначение исполнителя с уведомлениями
    - Обновление плановой даты
    """

    def __init__(self, db: Session):
        self.db = db

    def resolve_coordinates(
        self,
        raw_address: str,
        organization_id: Optional[int] = None,
    ) -> Tuple[float, float]:
        parsed = parse_address(raw_address)
        normalized_raw = geocoding_service.normalize_address(raw_address).lower()

        candidates_query = (
            self.db.query(AddressModel)
            .filter(
                AddressModel.is_active.is_(True),
                AddressModel.lat.isnot(None),
                AddressModel.lon.isnot(None),
            )
        )
        if organization_id is not None:
            candidates_query = candidates_query.filter(
                AddressModel.organization_id == organization_id
            )

        search_clauses = []
        if parsed.street:
            search_clauses.extend(
                [
                    AddressModel.street.ilike(f"%{parsed.street}%"),
                    AddressModel.address.ilike(f"%{parsed.street}%"),
                ]
            )
        if parsed.building:
            search_clauses.extend(
                [
                    AddressModel.building.ilike(f"%{parsed.building}%"),
                    AddressModel.address.ilike(f"%{parsed.building}%"),
                ]
            )
        if parsed.city:
            search_clauses.extend(
                [
                    AddressModel.city.ilike(f"%{parsed.city}%"),
                    AddressModel.address.ilike(f"%{parsed.city}%"),
                ]
            )
        if search_clauses:
            candidates_query = candidates_query.filter(or_(*search_clauses))

        best_candidate = None
        best_score = 0
        for candidate in candidates_query.order_by(AddressModel.updated_at.desc()).limit(25).all():
            if not has_valid_task_coordinates(candidate.lat, candidate.lon):
                continue

            score = 0
            normalized_candidate = geocoding_service.normalize_address(
                candidate.address or ""
            ).lower()
            if normalized_candidate and normalized_candidate == normalized_raw:
                score += 100
            elif normalized_candidate and (
                normalized_candidate in normalized_raw or normalized_raw in normalized_candidate
            ):
                score += 55

            score += _string_match_score(parsed.street, candidate.street)
            score += _string_match_score(parsed.building, candidate.building)
            score += _string_match_score(parsed.corpus, candidate.corpus)
            score += _string_match_score(parsed.city, candidate.city)

            if candidate.address and parsed.street and parsed.street.lower() in candidate.address.lower():
                score += 12
            if candidate.address and parsed.building and parsed.building.lower() in candidate.address.lower():
                score += 16

            if score > best_score:
                best_score = score
                best_candidate = candidate

        if best_candidate is not None and best_score >= 34:
            logger.info(
                "Resolved task coordinates from address book for '%s' -> (%s, %s)",
                raw_address,
                best_candidate.lat,
                best_candidate.lon,
            )
            return best_candidate.lat, best_candidate.lon

        return geocoding_service.geocode(raw_address)

    def repair_task_coordinates(self, task: TaskModel) -> bool:
        if has_valid_task_coordinates(task.lat, task.lon):
            return False
        if not task.raw_address.strip():
            return False

        lat, lon = self.resolve_coordinates(task.raw_address, task.organization_id)
        if not has_valid_task_coordinates(lat, lon):
            return False

        changed = task.lat != lat or task.lon != lon
        task.lat = lat
        task.lon = lon
        return changed

    def get_by_id(self, task_id: int) -> TaskModel:
        """
        Получить заявку по ID.

        Raises:
            TaskNotFoundError: если заявка не найдена
        """
        task = self.db.query(TaskModel).filter(TaskModel.id == task_id).first()
        if not task:
            raise TaskNotFoundError(task_id)
        return task

    def get_list(
        self,
        user: UserModel,
        status: Optional[str] = None,
        assignee_id: Optional[int] = None,
    ) -> List[TaskModel]:
        """
        Получить список заявок с учётом прав.

        - Workers: только свои заявки
        - Dispatchers/Admins: все заявки (опционально по assignee_id)
        """
        tenant = TenantFilter(user)
        query = tenant.apply(self.db.query(TaskModel), TaskModel)

        if status:
            query = query.filter(TaskModel.status == status)

        # Workers видят только свои заявки
        if user.role == UserRole.WORKER.value:
            query = query.filter(TaskModel.assigned_user_id == user.id)
        elif assignee_id is not None:
            query = query.filter(TaskModel.assigned_user_id == assignee_id)

        return query.order_by(
            priority_rank_expr(TaskModel.priority).desc(), TaskModel.created_at.desc()
        ).all()

    def create(self, data: TaskCreate, user: Optional[UserModel] = None) -> TaskModel:
        """
        Создать новую заявку.

        - Геокодирует адрес
        - Извлекает приоритет из текста
        - Извлекает номер заявки из диспетчерской
        - Генерирует внутренний номер
        """
        # Геокодирование
        lat, lon = self.resolve_coordinates(
            data.address,
            user.organization_id if user else None,
        )

        # Приоритет: из запроса или из текста
        priority = (
            normalize_priority_value(data.priority)
            if data.priority is not None
            else geocoding_service.extract_priority(data.address)
        )

        # Извлечение номера диспетчера
        task_number = (
            geocoding_service.extract_task_number(data.title)
            or geocoding_service.extract_task_number(data.address)
            or geocoding_service.extract_task_number(data.description)
        )

        # Валидация статуса
        status = (
            data.status
            if data.status in {s.value for s in TaskStatus}
            else TaskStatus.NEW.value
        )

        # Проверка исполнителя
        assigned_id = data.assigned_user_id
        tenant = TenantFilter(user) if user else None
        if assigned_id:
            assigned_user = (
                self.db.query(UserModel).filter(UserModel.id == assigned_id).first()
            )
            if not assigned_user:
                assigned_id = None
            elif tenant is not None:
                tenant.enforce_access(
                    assigned_user,
                    detail="Нельзя назначить пользователя из другой организации",
                )

        # Создание
        task = TaskModel(
            title=data.title,
            raw_address=data.address,
            description=data.description,
            customer_name=data.customer_name,
            customer_phone=data.customer_phone,
            lat=lat,
            lon=lon,
            status=status,
            priority=priority,
            planned_date=data.planned_date,
            assigned_user_id=assigned_id,
            is_remote=bool(data.is_remote) if data.is_remote is not None else False,
            is_paid=bool(data.is_paid) if data.is_paid is not None else False,
            payment_amount=data.payment_amount or 0.0,
            # Система и тип неисправности
            system_id=data.system_id,
            system_type=data.system_type,
            defect_type=data.defect_type,
        )

        if tenant is not None:
            tenant.set_org_id(task)

        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)

        # Генерация номера
        task.task_number = task_number if task_number else f"Z-{task.id:05d}"
        self.db.commit()
        self.db.refresh(task)

        logger.info(f"✅ Заявка №{task.task_number} создана")

        return task

    def update_status(
        self,
        task_id: int,
        new_status: str,
        comment_text: str = "",
        user: Optional[UserModel] = None,
    ) -> TaskModel:
        """
        Обновить статус заявки.

        - Валидирует переход через TaskStatusMachine
        - Добавляет комментарий
        - Отправляет push-уведомления

        Raises:
            TaskNotFoundError: заявка не найдена
            InvalidTransitionError: недопустимый переход статуса
        """
        task = self.get_by_id(task_id)
        old_status = task.status
        normalized_comment = comment_text.strip()

        # Валидация перехода
        if not TaskStatusMachine.is_valid_transition(old_status, new_status):
            raise InvalidTransitionError(old_status, new_status)

        if (
            old_status != new_status
            and new_status in {TaskStatus.DONE.value, TaskStatus.CANCELLED.value}
            and not normalized_comment
        ):
            raise CommentRequiredError(new_status)

        # Обновление
        task.status = new_status
        task.updated_at = datetime.now(timezone.utc)

        # Дата завершения
        if new_status == "DONE" and old_status != "DONE":
            task.completed_at = datetime.now(timezone.utc)
        elif new_status != "DONE":
            task.completed_at = None

        # Комментарий
        author = user.full_name if user else "Сотрудник"
        old_display = get_status_display_name(old_status)
        new_display = get_status_display_name(new_status)
        final_comment = (
            normalized_comment or f"Статус изменён: {old_display} → {new_display}"
        )

        comment = CommentModel(
            task_id=task_id,
            text=final_comment,
            author=author,
            author_id=user.id if user else None,
            old_status=old_status,
            new_status=new_status,
        )
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(task)

        # Push уведомление исполнителю
        self._notify_status_change(task, new_status, user)

        # Создание уведомления в БД
        if user:
            create_task_status_notification(
                db=self.db,
                task=task,
                old_status=old_status,
                new_status=new_status,
                changed_by=user,
            )

        return task

    def assign(
        self, task_id: int, assignee_id: Optional[int], user: UserModel
    ) -> TaskModel:
        """
        Назначить заявку исполнителю.

        - Проверяет существование исполнителя
        - Отправляет push при назначении
        """
        task = self.get_by_id(task_id)
        tenant = TenantFilter(user)
        tenant.enforce_access(task, detail="Нет доступа к этой заявке")
        old_assignee_id = task.assigned_user_id

        if assignee_id:
            assignee = (
                self.db.query(UserModel).filter(UserModel.id == assignee_id).first()
            )
            if not assignee:
                raise TaskServiceError("Пользователь не найден", 404)
            tenant.enforce_access(
                assignee, detail="Нельзя назначить пользователя из другой организации"
            )
            task.assigned_user_id = assignee.id
        else:
            task.assigned_user_id = None

        task.updated_at = datetime.now(timezone.utc)

        if old_assignee_id != task.assigned_user_id:
            old_user = (
                self.db.query(UserModel).filter(UserModel.id == old_assignee_id).first()
                if old_assignee_id
                else None
            )
            new_user = (
                self.db.query(UserModel)
                .filter(UserModel.id == task.assigned_user_id)
                .first()
                if task.assigned_user_id
                else None
            )
            old_name = (
                (old_user.full_name or old_user.username) if old_user else "Не назначен"
            )
            new_name = (
                (new_user.full_name or new_user.username) if new_user else "Не назначен"
            )
            author = (user.full_name or user.username) if user else "Система"

            comment = CommentModel(
                task_id=task_id,
                text=f"Назначение изменено: {old_name} → {new_name}",
                author=author,
                author_id=user.id if user else None,
                old_assignee=old_name,
                new_assignee=new_name,
            )
            self.db.add(comment)

        self.db.commit()
        self.db.refresh(task)

        # Уведомление новому исполнителю
        if task.assigned_user_id and task.assigned_user_id != old_assignee_id:
            self._notify_assignment(task)

            # Создание уведомления в БД
            assigned_to = (
                self.db.query(UserModel)
                .filter(UserModel.id == task.assigned_user_id)
                .first()
            )
            if assigned_to:
                create_task_assignment_notification(
                    db=self.db, task=task, assigned_to=assigned_to, assigned_by=user
                )

        return task

    def update_planned_date(
        self,
        task_id: int,
        planned_date: Optional[datetime],
        user: Optional[UserModel] = None,
    ) -> TaskModel:
        """
        Обновить плановую дату выполнения.

        Добавляет комментарий об изменении.
        """
        task = self.get_by_id(task_id)
        task.planned_date = planned_date
        task.updated_at = datetime.now(timezone.utc)

        # Комментарий
        author = user.full_name if user else "Сотрудник"
        formatted_date = (
            planned_date.strftime("%d.%m.%Y") if planned_date else "не указана"
        )

        comment = CommentModel(
            task_id=task_id,
            text=f"Планируемая дата: {formatted_date}",
            author=author,
            author_id=user.id if user else None,
        )
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(task)

        return task

    def delete(self, task_id: int) -> None:
        """Удалить заявку"""
        task = self.get_by_id(task_id)
        self.db.delete(task)
        self.db.commit()

    def check_access(self, task: TaskModel, user: UserModel) -> bool:
        """
        Проверить доступ пользователя к заявке.

        Workers имеют доступ только к своим заявкам.
        """
        tenant = TenantFilter(user)
        if not tenant.check_access(task):
            return False

        if user.role == UserRole.WORKER.value:
            return task.assigned_user_id == user.id
        return True

    def _notify_status_change(
        self, task: TaskModel, new_status: str, user: Optional[UserModel]
    ) -> None:
        """Отправить push о смене статуса"""
        if task.assigned_user_id and (not user or user.id != task.assigned_user_id):
            send_push_notification(
                title="Изменён статус заявки",
                body=f"№{task.task_number}: {get_status_display_name(new_status)}",
                notification_type="status_change",
                task_id=task.id,
                user_ids=[task.assigned_user_id],
            )

    def _notify_assignment(self, task: TaskModel) -> None:
        """Отправить push о назначении"""
        priority_name = get_priority_display_name(task.priority)
        title = (
            f"Новая заявка ({priority_name})"
            if get_priority_rank(task.priority) >= 3
            else "Вам назначена заявка"
        )

        send_push_notification(
            title=title,
            body=f"№{task.task_number}: {task.title[:50]}...",
            notification_type="task_assigned",
            task_id=task.id,
            user_ids=[task.assigned_user_id],
        )


# Factory function для DI
def get_task_service(db: Session = Depends(get_db)) -> TaskService:
    """Получить экземпляр TaskService"""
    return TaskService(db)
