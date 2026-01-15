"""
Task Service
============
Бизнес-логика для работы с заявками.

Централизует логику создания, обновления, валидации заявок.
Упрощает тестирование и переиспользование кода.
"""

import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from fastapi import Depends

from app.models import TaskModel, UserModel, CommentModel, TaskStatus, UserRole, get_db
from app.schemas import TaskCreate, TaskStatusUpdate
from app.services.geocoding import geocoding_service
from app.services.task_state_machine import TaskStatusMachine
from app.services.push import send_push_notification
from app.services.notification_service import (
    create_task_status_notification,
    create_task_assignment_notification
)
from app.utils import STATUS_DISPLAY_NAMES, PRIORITY_DISPLAY_NAMES, get_status_display_name


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
            f"Невозможен переход {from_status} → {to_status}. Допустимые: {valid}",
            422
        )


logger = logging.getLogger(__name__)


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
        assignee_id: Optional[int] = None
    ) -> List[TaskModel]:
        """
        Получить список заявок с учётом прав.
        
        - Workers: только свои заявки
        - Dispatchers/Admins: все заявки (опционально по assignee_id)
        """
        query = self.db.query(TaskModel)
        
        if status:
            query = query.filter(TaskModel.status == status)
        
        # Workers видят только свои заявки
        if user.role == UserRole.WORKER.value:
            query = query.filter(TaskModel.assigned_user_id == user.id)
        elif assignee_id is not None:
            query = query.filter(TaskModel.assigned_user_id == assignee_id)
        
        return query.order_by(
            TaskModel.priority.desc(),
            TaskModel.created_at.desc()
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
        lat, lon = geocoding_service.geocode(data.address)
        
        # Приоритет: из запроса или из текста
        priority = data.priority if data.priority is not None else \
                   geocoding_service.extract_priority(data.address)
        
        # Извлечение номера диспетчера
        task_number = (
            geocoding_service.extract_task_number(data.title) or
            geocoding_service.extract_task_number(data.address) or
            geocoding_service.extract_task_number(data.description)
        )
        
        # Валидация статуса
        status = data.status if data.status in {s.value for s in TaskStatus} \
                 else TaskStatus.NEW.value
        
        # Проверка исполнителя
        assigned_id = data.assigned_user_id
        if assigned_id:
            assigned_user = self.db.query(UserModel).filter(
                UserModel.id == assigned_id
            ).first()
            if not assigned_user:
                assigned_id = None
        
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
        user: Optional[UserModel] = None
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
        
        # Валидация перехода
        if not TaskStatusMachine.is_valid_transition(old_status, new_status):
            raise InvalidTransitionError(old_status, new_status)
        
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
        final_comment = comment_text or f"Статус изменён: {old_display} → {new_display}"
        
        comment = CommentModel(
            task_id=task_id,
            text=final_comment,
            author=author,
            author_id=user.id if user else None,
            old_status=old_status,
            new_status=new_status
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
                changed_by=user
            )
        
        return task
    
    def assign(
        self,
        task_id: int,
        assignee_id: Optional[int],
        user: UserModel
    ) -> TaskModel:
        """
        Назначить заявку исполнителю.
        
        - Проверяет существование исполнителя
        - Отправляет push при назначении
        """
        task = self.get_by_id(task_id)
        old_assignee_id = task.assigned_user_id
        
        if assignee_id:
            assignee = self.db.query(UserModel).filter(
                UserModel.id == assignee_id
            ).first()
            if not assignee:
                raise TaskServiceError("Пользователь не найден", 404)
            task.assigned_user_id = assignee.id
        else:
            task.assigned_user_id = None
        
        task.updated_at = datetime.now(timezone.utc)
        
        if old_assignee_id != task.assigned_user_id:
            old_user = self.db.query(UserModel).filter(UserModel.id == old_assignee_id).first() if old_assignee_id else None
            new_user = self.db.query(UserModel).filter(UserModel.id == task.assigned_user_id).first() if task.assigned_user_id else None
            old_name = (old_user.full_name or old_user.username) if old_user else "Не назначен"
            new_name = (new_user.full_name or new_user.username) if new_user else "Не назначен"
            author = (user.full_name or user.username) if user else "Система"
            
            comment = CommentModel(
                task_id=task_id,
                text=f"Назначение изменено: {old_name} → {new_name}",
                author=author,
                author_id=user.id if user else None,
                old_assignee=old_name,
                new_assignee=new_name
            )
            self.db.add(comment)
        
        self.db.commit()
        self.db.refresh(task)
        
        # Уведомление новому исполнителю
        if task.assigned_user_id and task.assigned_user_id != old_assignee_id:
            self._notify_assignment(task)
            
            # Создание уведомления в БД
            assigned_to = self.db.query(UserModel).filter(
                UserModel.id == task.assigned_user_id
            ).first()
            if assigned_to:
                create_task_assignment_notification(
                    db=self.db,
                    task=task,
                    assigned_to=assigned_to,
                    assigned_by=user
                )
        
        return task
    
    def update_planned_date(
        self,
        task_id: int,
        planned_date: Optional[datetime],
        user: Optional[UserModel] = None
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
        formatted_date = planned_date.strftime("%d.%m.%Y") if planned_date else "не указана"
        
        comment = CommentModel(
            task_id=task_id,
            text=f"Планируемая дата: {formatted_date}",
            author=author,
            author_id=user.id if user else None
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
        if user.role == UserRole.WORKER.value:
            return task.assigned_user_id == user.id
        return True
    
    def _notify_status_change(
        self,
        task: TaskModel,
        new_status: str,
        user: Optional[UserModel]
    ) -> None:
        """Отправить push о смене статуса"""
        if task.assigned_user_id and (not user or user.id != task.assigned_user_id):
            send_push_notification(
                title="Изменён статус заявки",
                body=f"№{task.task_number}: {get_status_display_name(new_status)}",
                notification_type="status_change",
                task_id=task.id,
                user_ids=[task.assigned_user_id]
            )
    
    def _notify_assignment(self, task: TaskModel) -> None:
        """Отправить push о назначении"""
        from app.utils import get_priority_display_name
        priority_name = get_priority_display_name(task.priority)
        title = f"Новая заявка ({priority_name})" if task.priority >= 3 \
                else "Вам назначена заявка"
        
        send_push_notification(
            title=title,
            body=f"№{task.task_number}: {task.title[:50]}...",
            notification_type="task_assigned",
            task_id=task.id,
            user_ids=[task.assigned_user_id]
        )


# Factory function для DI
def get_task_service(db: Session = Depends(get_db)) -> TaskService:
    """Получить экземпляр TaskService"""
    return TaskService(db)
