"""
API v2 — Meta endpoint
=======================
Информация о версии API.
"""

from fastapi import APIRouter

from app.config import settings

router = APIRouter(tags=["v2-meta"])


@router.get("/version")
async def api_version():
    """
    Информация о доступных версиях API.

    v2-only endpoint для получения мета-информации.
    """
    return {
        "current_version": "v2",
        "supported_versions": ["v1", "v2"],
        "server_version": settings.API_VERSION,
        "deprecation": {
            "v1": {
                "status": "supported",
                "sunset_date": None,
                "note": "v1 полностью поддерживается. Все эндпоинты /api/* эквивалентны /api/v1/*",
            },
            "v2": {
                "status": "current",
                "note": "Текущая версия. Включает envelope-формат ответов и расширенные задачи.",
            },
        },
    }
