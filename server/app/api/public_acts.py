"""
Public acts API — без входа
===========================
Клиент открывает акт по ссылке от мастера или диспетчера: смотрит, скачивает
PDF и, если акт ждёт подписи, подписывает его на экране. Страница проверки
подлинности находит акт по номеру и контрольной сумме из подвала распечатки.

Токен ссылки — 32 случайных байта, в БД только его хеш; телефон заказчика
наружу не отдаётся.
"""

import asyncio
import json
from datetime import timezone
from typing import Optional
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.models import ActModel, get_db
from app.schemas.act import ActVerification, PublicActLine, PublicActView
from app.services.act_pdf import render_act_pdf
from app.services.act_service import (
    CANCELLED,
    MAX_SIGNATURE_BYTES,
    PENDING,
    ActServiceError,
    act_by_public_token,
    sign_by_link,
    verify_act,
)
from app.services.business_time import business_tz
from app.services.ip_guard import ip_guard
from app.services.public_url import public_base_url
from app.services.websocket_manager import broadcast_act_updated

router = APIRouter(prefix="/api/public/acts", tags=["Public acts"])

MAX_STROKES_CHARS = 512 * 1024
_NOT_FOUND = "Ссылка недействительна или устарела — попросите новую"


def _signed_local(act: ActModel) -> Optional[str]:
    signature = (act.content_snapshot or {}).get("signature") or {}
    if signature.get("signed_local"):
        return signature["signed_local"]
    if act.signed_at is None:
        return None
    moment = act.signed_at.replace(tzinfo=timezone.utc).astimezone(business_tz())
    return moment.strftime("%d.%m.%Y %H:%M")


def _organization(act: ActModel) -> Optional[str]:
    requisites = act.requisites_snapshot or {}
    return requisites.get("legal_name") or requisites.get("organization_name")


def _show_prices(act: ActModel) -> bool:
    template = (act.requisites_snapshot or {}).get("template") or {}
    return bool(template.get("show_prices", True))


def _view(act: ActModel) -> PublicActView:
    content = act.content_snapshot or {}
    template = (act.requisites_snapshot or {}).get("template") or {}
    task = content.get("task") or {}
    prices = _show_prices(act)
    return PublicActView(
        number=act.number,
        title=template.get("title") or "Акт выполненных работ",
        status=act.status,
        organization=_organization(act),
        issued_local=content.get("issued_local"),
        task_number=task.get("number"),
        address=task.get("address"),
        worker=content.get("worker") or content.get("issued_by"),
        customer_name=(content.get("customer") or {}).get("name"),
        work_summary=content.get("work_summary"),
        customer_remarks=content.get("customer_remarks"),
        no_claims=bool(content.get("no_claims", True)),
        acceptance_text=template.get("acceptance_text"),
        show_prices=prices,
        lines=[
            PublicActLine(
                name=line.get("name") or "",
                line_type=line.get("line_type") or "work",
                unit=line.get("unit"),
                qty=str(line.get("qty") or ""),
                price=line.get("price") if prices else None,
                amount=line.get("amount") if prices else None,
            )
            for line in content.get("lines") or []
        ],
        total=content.get("total") if prices else None,
        signed_via=act.signed_via,
        signed_local=_signed_local(act),
        can_sign=act.status == PENDING,
        expires_at=act.public_link_expires_at,
    )


def _by_token(db: Session, token: str, for_update: bool = False) -> ActModel:
    act = act_by_public_token(db, token, for_update=for_update)
    if act is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return act


# /verify объявлен раньше /{token}: иначе «verify» сошёл бы за токен
@router.get("/verify", response_model=ActVerification)
def verify(
    number: str = Query(..., min_length=1, max_length=32),
    h: str = Query(..., min_length=16, max_length=64),
    db: Session = Depends(get_db),
):
    """Подлинность распечатки: номер и контрольная сумма из подвала PDF."""
    act = verify_act(db, number, h)
    if act is None:
        raise HTTPException(
            status_code=404,
            detail="Акт с таким номером и контрольной суммой не найден",
        )
    replaced_by = None
    if act.status == CANCELLED:
        replaced_by = (
            db.query(ActModel.number)
            .filter(ActModel.supersedes_act_id == act.id)
            .scalar()
        )
    content = act.content_snapshot or {}
    return ActVerification(
        number=act.number,
        organization=_organization(act),
        issued_local=content.get("issued_local"),
        status=act.status,
        signed_via=act.signed_via,
        signed_local=_signed_local(act),
        worker=content.get("worker") or content.get("issued_by"),
        total=content.get("total") if _show_prices(act) else None,
        document_hash=act.document_hash,
        replaced_by=replaced_by,
    )


@router.get("/{token}", response_model=PublicActView)
def get_public_act(token: str, db: Session = Depends(get_db)):
    return _view(_by_token(db, token))


@router.get("/{token}/pdf")
def get_public_act_pdf(token: str, request: Request, db: Session = Depends(get_db)):
    act = _by_token(db, token)
    return Response(
        content=render_act_pdf(act, public_base_url(request)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{quote(f'Акт {act.number}.pdf')}"
            )
        },
    )


@router.post("/{token}/sign", response_model=PublicActView)
async def sign_public_act(
    token: str,
    request: Request,
    signature: UploadFile = File(..., description="Подпись клиента, PNG"),
    signer_name: str = Form(..., max_length=200),
    consent: bool = Form(...),
    strokes: Optional[str] = Form(None, max_length=MAX_STROKES_CHARS),
    db: Session = Depends(get_db),
):
    """Клиент подписывает акт по ссылке — один раз, пока ссылка действует."""
    if not consent:
        raise HTTPException(
            status_code=400, detail="Подтвердите, что ознакомились с актом"
        )
    png = await signature.read(MAX_SIGNATURE_BYTES + 1)
    try:
        parsed_strokes = json.loads(strokes) if strokes else None
    except ValueError:
        parsed_strokes = None
    act = _by_token(db, token, for_update=True)
    try:
        act = sign_by_link(
            db,
            act,
            png,
            parsed_strokes,
            signer_name,
            ip=ip_guard.get_client_ip(request),
            device=request.headers.get("user-agent"),
        )
    except ActServiceError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    asyncio.ensure_future(
        broadcast_act_updated(
            act_id=act.id,
            task_id=act.task_id,
            number=act.number,
            status=act.status,
            organization_id=act.organization_id,
        )
    )
    return _view(act)
