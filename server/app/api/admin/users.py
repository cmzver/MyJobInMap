"""
Admin Users API
===============
Тонкие контроллеры управления пользователями (только для админа).
Бизнес-логика CRUD — в app/services/user_service.py (UserService).
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.models import UserModel
from app.schemas import UserCreate, UserResponse, UserStatsResponse, UserUpdate
from app.services import (
    UserService,
    UserServiceError,
    get_current_admin,
    get_current_dispatcher_or_admin,
    get_user_service,
)
from app.utils import user_list_to_responses, user_to_response

router = APIRouter(prefix="/api/admin", tags=["Admin - Users"])


@router.get("/users", response_model=List[UserResponse])
async def get_users(
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Получить список пользователей"""
    return user_list_to_responses(service.list_users(admin))


@router.get("/workers", response_model=List[UserResponse])
async def get_workers(
    user: UserModel = Depends(get_current_dispatcher_or_admin),
    service: UserService = Depends(get_user_service),
):
    """Получить список работников (для диспетчеров и админов)"""
    return user_list_to_responses(service.list_workers(user))


@router.get("/users/{user_id}/stats", response_model=UserStatsResponse)
async def get_user_stats(
    user_id: int,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Получить статистику пользователя"""
    try:
        return service.get_stats(admin, user_id)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Создать пользователя"""
    try:
        user = service.create(admin, user_data)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return user_to_response(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Обновить пользователя"""
    try:
        user = service.update(admin, user_id, user_data)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return user_to_response(user)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: UserModel = Depends(get_current_admin),
    service: UserService = Depends(get_user_service),
):
    """Удалить пользователя"""
    try:
        service.delete(admin, user_id)
    except UserServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return {"message": "User deleted", "id": user_id}
