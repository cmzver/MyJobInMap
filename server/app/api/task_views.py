"""Сохранённые виды: границы пользователя и организации проверяются на сервере."""

import hashlib
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import UserModel, get_db
from app.models.task_view import TaskViewModel
from app.services import require_permission
from app.services.role_utils import is_dispatcher_or_admin_user

router = APIRouter(prefix="/api/task-views", tags=["Task views"])


class ViewSettings(BaseModel):
    search: str = Field("", max_length=200)
    statuses: list[Literal["NEW", "IN_PROGRESS", "DONE", "CANCELLED"]] = []
    priorities: list[Literal["EMERGENCY", "URGENT", "CURRENT", "PLANNED"]] = []
    assignees: list[str] = Field(default_factory=list, max_length=200)
    addressId: str = Field("", max_length=30)
    addressTitle: str = Field("", max_length=200)
    sort: Literal["created_at_desc", "created_at_asc", "due_at_asc"] = "created_at_desc"
    groupBy: Literal["", "status", "assignee", "priority"] = ""
    displayMode: Literal["list", "dispatch"] = "list"
    repeat: Literal["", "duplicate", "return"] = ""
    due: Literal["", "overdue", "soon"] = ""

    @field_validator("assignees")
    @classmethod
    def validate_assignees(cls, values):
        if any(v != "unassigned" and not v.isdecimal() for v in values):
            raise ValueError("Некорректный исполнитель")
        return list(dict.fromkeys(values))


class ViewCreate(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    settings: ViewSettings
    shared: bool = False
    source_id: str | None = Field(None, max_length=100)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Введите не менее двух символов")
        return value


class ViewResponse(BaseModel):
    id: str
    name: str
    settings: ViewSettings
    shared: bool
    can_edit: bool


def response(row, user):
    return ViewResponse(
        id=row.id,
        name=row.name,
        settings=row.settings,
        shared=row.shared,
        can_edit=row.owner_id == user.id
        or (row.shared and is_dispatcher_or_admin_user(user)),
    )


def visible(db, user):
    # Общие виды видны только в текущей организации, в том числе суперадмину.
    return db.query(TaskViewModel).filter(
        TaskViewModel.organization_id == user.organization_id,
        or_(TaskViewModel.owner_id == user.id, TaskViewModel.shared.is_(True)),
    )


@router.get("", response_model=list[ViewResponse])
def list_views(
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    return [
        response(row, user)
        for row in visible(db, user).order_by(TaskViewModel.name).all()
    ]


@router.post("", response_model=ViewResponse)
def create_view(
    data: ViewCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    if data.shared and not is_dispatcher_or_admin_user(user):
        raise HTTPException(403, "Общие виды создаёт диспетчер или администратор")
    source_id = (
        hashlib.sha256(f"{user.organization_id}:{data.source_id}".encode()).hexdigest()
        if data.source_id
        else None
    )
    if source_id:
        existing = (
            db.query(TaskViewModel)
            .filter_by(owner_id=user.id, source_id=source_id)
            .first()
        )
        if existing:
            return response(existing, user)
    row = TaskViewModel(
        owner_id=user.id,
        organization_id=user.organization_id,
        name=data.name,
        settings=data.settings.model_dump(),
        shared=data.shared,
        source_id=source_id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if data.source_id:
            existing = (
                db.query(TaskViewModel)
                .filter_by(owner_id=user.id, source_id=source_id)
                .first()
            )
            if existing:
                return response(existing, user)
        raise
    return response(row, user)


@router.put("/{view_id}", response_model=ViewResponse)
def update_view(
    view_id: str,
    data: ViewCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    row = visible(db, user).filter(TaskViewModel.id == view_id).first()
    if row is None:
        raise HTTPException(404, "Вид не найден")
    if not response(row, user).can_edit or (
        data.shared and not is_dispatcher_or_admin_user(user)
    ):
        raise HTTPException(403, "Нет прав на изменение вида")
    # Чужой общий вид нельзя превратить в личный.
    if row.owner_id != user.id and not data.shared:
        raise HTTPException(403, "Изменить доступность может только автор")
    row.name, row.settings, row.shared = (
        data.name,
        data.settings.model_dump(),
        data.shared,
    )
    db.commit()
    return response(row, user)


@router.delete("/{view_id}", status_code=204)
def delete_view(
    view_id: str,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_tasks")),
):
    row = visible(db, user).filter(TaskViewModel.id == view_id).first()
    if row is None:
        raise HTTPException(404, "Вид не найден")
    if not response(row, user).can_edit:
        raise HTTPException(403, "Нет прав на удаление вида")
    db.delete(row)
    db.commit()
