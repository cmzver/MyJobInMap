"""
Analytics API package
======================
Аналитика и отчётность под отдельными префиксами (/api/analytics, /api/reports,
/api/sla, /api/dashboard, /api/finance) собраны в один доменный пакет и
агрегируются в общий router.
"""

from fastapi import APIRouter

from app.api.analytics.dashboard import router as dashboard_router
from app.api.analytics.finance import router as finance_router
from app.api.analytics.overview import router as overview_router
from app.api.analytics.reports import router as reports_router
from app.api.analytics.sla import router as sla_router

router = APIRouter()
router.include_router(overview_router)
router.include_router(reports_router)
router.include_router(sla_router)
router.include_router(dashboard_router)
router.include_router(finance_router)

__all__ = ["router"]
