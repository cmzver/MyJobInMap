"""
Notifications API
=================
Эндпоинты для уведомлений и push-уведомлений.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.models import UserModel, NotificationModel, get_db
from app.schemas import PushNotificationRequest, NotificationResponse
from app.services import get_current_admin, get_current_user_required, _send_push_sync
from app.services.tenant_filter import TenantFilter


router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


# ========== Notifications CRUD ==========

@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    is_read: Optional[bool] = Query(None, description="Фильтр по статусу прочтения"),
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Получить список уведомлений текущего пользователя"""
    query = db.query(NotificationModel).filter(
        NotificationModel.user_id == current_user.id
    )
    
    if is_read is not None:
        query = query.filter(NotificationModel.is_read == is_read)
    
    notifications = query.order_by(NotificationModel.created_at.desc()).limit(100).all()
    return notifications


@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Отметить уведомление как прочитанное"""
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    
    notification.is_read = True
    db.commit()
    
    return {"success": True, "message": "Уведомление отмечено как прочитанное"}


@router.patch("/read-all")
async def mark_all_notifications_as_read(
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Отметить все уведомления как прочитанные"""
    db.query(NotificationModel).filter(
        NotificationModel.user_id == current_user.id,
        NotificationModel.is_read == False  # noqa: E712
    ).update({"is_read": True})
    
    db.commit()
    
    return {"success": True, "message": "Все уведомления отмечены как прочитанные"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: UserModel = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Удалить уведомление"""
    notification = db.query(NotificationModel).filter(
        NotificationModel.id == notification_id,
        NotificationModel.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    
    db.delete(notification)
    db.commit()
    
    return {"success": True, "message": "Уведомление удалено"}


# ========== Push Notifications ==========

@router.post("/send")
async def send_notification(
    request: PushNotificationRequest,
    admin: UserModel = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Отправка push-уведомления (только для админа)"""
    tenant = TenantFilter(admin)
    if request.user_ids and not tenant.is_superadmin:
        users = db.query(UserModel).filter(UserModel.id.in_(request.user_ids)).all()
        if len(users) != len(request.user_ids):
            raise HTTPException(status_code=404, detail="Некоторые пользователи не найдены")
        for target_user in users:
            tenant.enforce_access(target_user, detail="Нельзя отправить уведомление пользователю из другой организации")

    result = _send_push_sync(
        title=request.title,
        body=request.body,
        notification_type=request.notification_type,
        task_id=request.task_id,
        user_ids=request.user_ids,
        organization_id=admin.organization_id,
    )
    
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("message"))
    
    return result


@router.post("/test")
async def send_test_notification(
    admin: UserModel = Depends(get_current_admin),
):
    """Тестовое push-уведомление"""
    return _send_push_sync(
        title="🔔 Тестовое уведомление",
        body="Push-уведомления работают!",
        notification_type="general",
        organization_id=admin.organization_id,
    )

