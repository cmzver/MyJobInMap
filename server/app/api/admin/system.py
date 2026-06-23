"""
Admin System Health API
========================
Сводка состояния сервера для супер-админа: ресурсы хоста, БД/Redis,
backup-scheduler, WebSocket и статус контейнеров (через docker-socket-proxy).
Логика — в system_health_service; здесь тонкий контроллер.
"""

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.models import UserModel, get_db
from app.services import get_current_superadmin
from app.services.system_health_service import collect_health

router = APIRouter(prefix="/api/admin", tags=["Admin - System"])


@router.get("/system/health")
async def system_health(
    db: Session = Depends(get_db),
    admin: UserModel = Depends(get_current_superadmin),
):
    """Полная health-сводка сервера (только супер-админ).

    Блокирующие вызовы (psutil, redis ping, HTTP к docker-proxy) уносим в
    threadpool, чтобы не держать event loop.
    """
    return await run_in_threadpool(collect_health, db)
