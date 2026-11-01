"""
Act Service
===========
Выпуск актов выполненных работ: строки из прайса и свободные, суммы считает
сервер, номер — без пропусков в пределах организации и года.

Выпущенный акт неизменяем. PDF рисуется из снимков (content_snapshot,
requisites_snapshot); document_hash — SHA-256 канонического JSON снимков,
по нему проверяют подлинность распечатки. Исправить акт — выпустить новый
с supersedes_act_id: прежний аннулируется.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ActCounterModel,
    ActLineModel,
    ActModel,
    CommentModel,
    OrganizationModel,
    OrganizationSettingsModel,
    ServiceCatalogItemModel,
    TaskModel,
    UserModel,
)
from app.schemas.act import ActCreate
from app.services.business_time import business_tz, to_naive_utc
from app.services.organization_settings_service import DEFAULT_ACT_NUMBER_PREFIX

PENDING = "pending_signature"
SIGNED = "signed"
CANCELLED = "cancelled"

SCAN_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
MAX_SCAN_BYTES = 15 * 1024 * 1024

_CENTS = Decimal("0.01")
_QTY = Decimal("0.001")
_REQUISITE_FIELDS = (
    "legal_name",
    "inn",
    "kpp",
    "ogrn",
    "legal_address",
    "bank_name",
    "bik",
    "account",
    "corr_account",
    "director_name",
    "director_title",
    "act_footer_text",
)


class ActServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _money(value) -> Decimal:
    return Decimal(str(value)).quantize(_CENTS, rounding=ROUND_HALF_UP)


def _user_name(user: Optional[UserModel]) -> Optional[str]:
    return (user.full_name or user.username) if user else None


def document_hash(content: dict, requisites: dict) -> str:
    """SHA-256 канонического JSON: одинаковые снимки — одинаковый хеш."""
    canonical = json.dumps(
        {"content": content, "requisites": requisites},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def next_act_number(db: Session, organization_id: int, year: int, prefix: str) -> str:
    """Следующий номер под блокировкой строки счётчика — без пропусков и дублей."""

    def locked():
        return (
            db.query(ActCounterModel)
            .filter(
                ActCounterModel.organization_id == organization_id,
                ActCounterModel.year == year,
            )
            .with_for_update()
            .first()
        )

    counter = locked()
    if counter is None:
        try:
            with db.begin_nested():
                db.add(ActCounterModel(organization_id=organization_id, year=year))
        except IntegrityError:
            pass  # параллельный запрос создал счётчик раньше
        counter = locked()
    counter.value += 1
    return f"{prefix}-{year}-{counter.value:06d}"


def _requisites(db: Session, organization_id: int) -> Dict[str, Optional[str]]:
    row = db.get(OrganizationSettingsModel, organization_id)
    organization = db.get(OrganizationModel, organization_id)
    values = {name: getattr(row, name) if row else None for name in _REQUISITE_FIELDS}
    values["organization_name"] = organization.name if organization else None
    return values


def _build_lines(db: Session, organization_id: int, data: ActCreate) -> List[dict]:
    ids = {line.catalog_item_id for line in data.lines if line.catalog_item_id}
    catalog = {
        item.id: item
        for item in db.query(ServiceCatalogItemModel).filter(
            ServiceCatalogItemModel.id.in_(ids),
            ServiceCatalogItemModel.organization_id == organization_id,
        )
    }
    lines = []
    for position, line in enumerate(data.lines, start=1):
        item = catalog.get(line.catalog_item_id) if line.catalog_item_id else None
        if line.catalog_item_id and (item is None or not item.is_active):
            raise ActServiceError(f"Строка {position}: позиции нет в прайсе", 400)
        name = (line.name or "").strip() or (item.name if item else "")
        price = _money(
            line.price if line.price is not None else (item.price if item else 0)
        )
        qty = Decimal(str(line.qty)).quantize(_QTY, rounding=ROUND_HALF_UP)
        lines.append(
            {
                "position": position,
                "line_type": line.line_type or (item.line_type if item else "work"),
                "catalog_item_id": item.id if item else None,
                "name": name,
                "unit": (line.unit or "").strip() or (item.unit if item else "усл"),
                "qty": qty,
                "price": price,
                "amount": _money(qty * price),
                "serial_number": (line.serial_number or "").strip() or None,
            }
        )
    return lines


def _comment(db: Session, task_id: Optional[int], text: str, user: UserModel) -> None:
    if task_id is not None:
        db.add(
            CommentModel(
                task_id=task_id,
                text=text,
                author=_user_name(user),
                author_id=user.id,
            )
        )


def create_act(
    db: Session, task: TaskModel, data: ActCreate, user: UserModel
) -> ActModel:
    """Выпустить акт по заявке: номер, снимки, хеш. Ждёт подписи."""
    if task.organization_id is None:
        raise ActServiceError("Акт оформляется только по заявке организации", 400)
    organization_id = task.organization_id

    superseded = None
    if data.supersedes_act_id is not None:
        superseded = (
            db.query(ActModel)
            .filter(
                ActModel.id == data.supersedes_act_id,
                ActModel.task_id == task.id,
            )
            .first()
        )
        if superseded is None or superseded.status == CANCELLED:
            raise ActServiceError("Исправляемый акт не найден или уже аннулирован", 400)

    lines = _build_lines(db, organization_id, data)
    total = sum((line["amount"] for line in lines), Decimal("0.00"))
    issued_at = datetime.now(timezone.utc)
    settings_row = db.get(OrganizationSettingsModel, organization_id)
    prefix = (
        settings_row.act_number_prefix if settings_row else None
    ) or DEFAULT_ACT_NUMBER_PREFIX
    number = next_act_number(
        db, organization_id, issued_at.astimezone(business_tz()).year, prefix
    )

    content = {
        "number": number,
        "issued_at": issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "issued_local": issued_at.astimezone(business_tz()).strftime("%d.%m.%Y"),
        "task": {
            "id": task.id,
            "number": task.task_number or f"Z-{task.id:05d}",
            "title": task.title,
            "address": task.raw_address,
            "defect_type": task.defect_type,
            "system_type": task.system_type,
        },
        "worker": _user_name(task.assigned_user),
        "issued_by": _user_name(user),
        "customer": {
            "name": (data.customer_name or "").strip() or None,
            "role": data.customer_role,
            "phone": (data.customer_phone or "").strip() or None,
            "apartment": (data.apartment or "").strip() or None,
        },
        "work_summary": (data.work_summary or "").strip() or None,
        "customer_remarks": (data.customer_remarks or "").strip() or None,
        "no_claims": data.no_claims,
        "payment_method": data.payment_method,
        "lines": [
            {
                **line,
                "qty": str(line["qty"].normalize()),
                "price": str(line["price"]),
                "amount": str(line["amount"]),
            }
            for line in lines
        ],
        "total": str(total),
    }
    requisites = _requisites(db, organization_id)

    act = ActModel(
        organization_id=organization_id,
        task_id=task.id,
        number=number,
        kind="task",
        status=PENDING,
        customer_name=content["customer"]["name"],
        customer_role=data.customer_role,
        customer_phone=content["customer"]["phone"],
        apartment=content["customer"]["apartment"],
        work_summary=content["work_summary"],
        customer_remarks=content["customer_remarks"],
        no_claims=data.no_claims,
        payment_method=data.payment_method,
        total_amount=total,
        content_snapshot=content,
        requisites_snapshot=requisites,
        document_hash=document_hash(content, requisites),
        supersedes_act_id=superseded.id if superseded else None,
        created_by_id=user.id,
        created_at=to_naive_utc(issued_at),
        lines=[ActLineModel(**line) for line in lines],
    )
    db.add(act)
    if superseded is not None:
        _cancel(superseded, f"Заменён актом №{number}", user)
    _comment(db, task.id, f"Оформлен акт №{number} на сумму {total} ₽", user)
    db.commit()
    db.refresh(act)
    return act


def _cancel(act: ActModel, reason: str, user: UserModel) -> None:
    act.status = CANCELLED
    act.cancel_reason = reason
    act.cancelled_by_id = user.id
    act.cancelled_at = to_naive_utc(datetime.now(timezone.utc))


def cancel_act(db: Session, act: ActModel, reason: str, user: UserModel) -> ActModel:
    if act.status == CANCELLED:
        raise ActServiceError("Акт уже аннулирован", 400)
    _cancel(act, reason.strip(), user)
    _comment(db, act.task_id, f"Акт №{act.number} аннулирован: {reason.strip()}", user)
    db.commit()
    db.refresh(act)
    return act


def acts_dir() -> Path:
    return settings.UPLOADS_DIR / "acts"


def attach_signed_scan(
    db: Session,
    act: ActModel,
    content: bytes,
    content_type: str,
    user: UserModel,
) -> ActModel:
    """Скан подписанного на бумаге акта: акт становится подписанным."""
    if act.status != PENDING:
        raise ActServiceError("Скан прикрепляют к акту, который ждёт подписи", 400)
    extension = SCAN_TYPES.get((content_type or "").split(";")[0].strip().lower())
    if extension is None:
        raise ActServiceError("Скан — PDF, JPG или PNG", 415)
    if not content:
        raise ActServiceError("Файл пустой", 400)
    if len(content) > MAX_SCAN_BYTES:
        raise ActServiceError("Скан больше 15 МБ", 413)

    relative = (
        Path(str(act.organization_id)) / f"{act.id}-{uuid.uuid4().hex}{extension}"
    )
    target = acts_dir() / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)

    act.scan_file = relative.as_posix()
    act.status = SIGNED
    act.signed_via = "paper"
    act.signed_at = to_naive_utc(datetime.now(timezone.utc))
    _comment(db, act.task_id, f"Акт №{act.number} подписан, загружен скан", user)
    db.commit()
    db.refresh(act)
    return act


def scan_path(act: ActModel) -> Optional[Path]:
    if not act.scan_file:
        return None
    path = (acts_dir() / act.scan_file).resolve()
    if acts_dir().resolve() not in path.parents or not path.is_file():
        return None
    return path
