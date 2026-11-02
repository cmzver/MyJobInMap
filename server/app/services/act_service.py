"""
Act Service
===========
Выпуск актов выполненных работ: строки из прайса и свободные, суммы считает
сервер, номер — без пропусков в пределах организации и года.

Выпущенный акт неизменяем. PDF рисуется из снимков (content_snapshot,
requisites_snapshot); document_hash — SHA-256 канонического JSON снимков и
подписей, по нему проверяют подлинность распечатки. Исправить акт — выпустить
новый с supersedes_act_id: прежний аннулируется.

С телефона мастера акт приходит сразу подписанным на экране (ActSigning),
с отказом клиента от подписи или ждущим подписи — как с портала.

Ждущий подписи акт клиент подписывает сам по ссылке без входа; по той же
ссылке забирают PDF подписанного. Подлинность распечатки проверяют по номеру
и контрольной сумме из подвала.
"""

import copy
import hashlib
import hmac
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, List, Optional, Tuple

from PIL import Image, UnidentifiedImageError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ActCounterModel,
    ActLineModel,
    ActModel,
    AddressEquipmentModel,
    AddressHistoryEventType,
    AddressHistoryModel,
    CommentModel,
    EquipmentStatus,
    OrganizationModel,
    OrganizationSettingsModel,
    ServiceCatalogItemModel,
    TaskModel,
    UserModel,
)
from app.schemas.act import ActCreate, ActMobileCreate
from app.services.business_time import business_tz, to_naive_utc
from app.services.organization_settings_service import (
    DEFAULT_ACT_NUMBER_PREFIX,
    act_template_of,
)

PENDING = "pending_signature"
SIGNED = "signed"
REFUSED = "refused"
CANCELLED = "cancelled"

MAX_SIGNATURE_BYTES = 1024 * 1024
MAX_STROKES_POINTS = 20_000
PUBLIC_LINK_TTL = timedelta(days=14)
# Ссылку дают на акт, который ждёт подписи (подписать) или подписан (забрать PDF)
_LINKABLE = (PENDING, SIGNED)
# Столько знаков контрольной суммы печатается в подвале PDF
HASH_PREFIX_LENGTH = 16
# Время подписи с телефона принимаем, пока оно правдоподобно: акт мог
# пролежать в офлайн-очереди, но не месяц и не «в будущем».
_SIGNED_AT_PAST = timedelta(days=30)
_SIGNED_AT_FUTURE = timedelta(minutes=5)

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


@dataclass
class ActSigning:
    """Что пришло с телефона мастера вместе с актом."""

    customer_png: Optional[bytes] = None
    worker_png: Optional[bytes] = None
    strokes: Optional[Any] = None
    signed_at: Optional[datetime] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    device: Optional[str] = None
    refusal_reason: Optional[str] = None

    @classmethod
    def from_payload(
        cls,
        data: ActMobileCreate,
        customer_png: Optional[bytes],
        worker_png: Optional[bytes],
        strokes: Optional[Any],
    ) -> "ActSigning":
        return cls(
            customer_png=customer_png or None,
            worker_png=worker_png or None,
            strokes=strokes,
            signed_at=data.signed_at,
            lat=data.sign_lat,
            lon=data.sign_lon,
            device=(data.sign_device or "").strip() or None,
            refusal_reason=(data.refusal_reason or "").strip() or None,
        )


def document_hash(
    content: dict, requisites: dict, signatures: Optional[dict] = None
) -> str:
    """SHA-256 канонического JSON: одинаковые снимки — одинаковый хеш.

    signatures — SHA-256 картинок подписей: подменить подпись, не изменив
    хеш, нельзя."""
    document = {"content": content, "requisites": requisites}
    if signatures:
        document["signatures"] = signatures
    canonical = json.dumps(
        document,
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


def requisites_snapshot(
    row: Optional[OrganizationSettingsModel], organization_name: Optional[str]
) -> dict:
    """Реквизиты и бланк акта на момент выпуска — из них рисуется PDF."""
    values = {name: getattr(row, name) if row else None for name in _REQUISITE_FIELDS}
    values["organization_name"] = organization_name
    values["template"] = act_template_of(row).model_dump()
    values["logo_file"] = row.act_logo_file if row else None
    return values


def _requisites(db: Session, organization_id: int) -> dict:
    organization = db.get(OrganizationModel, organization_id)
    return requisites_snapshot(
        db.get(OrganizationSettingsModel, organization_id),
        organization.name if organization else None,
    )


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
        line_type = line.line_type or (item.line_type if item else "work")
        built = {
            "position": position,
            "line_type": line_type,
            "catalog_item_id": item.id if item else None,
            "name": name,
            "unit": (line.unit or "").strip() or (item.unit if item else "усл"),
            "qty": qty,
            "price": price,
            "amount": _money(qty * price),
            "serial_number": (line.serial_number or "").strip() or None,
        }
        # Ключ только у установленных материалов: снимок прежних актов не меняется
        if line.install_to_object and line_type == "material":
            built["install_to_object"] = True
        lines.append(built)
    return lines


def _install_materials(
    db: Session, task: TaskModel, act: ActModel, user: UserModel
) -> List[str]:
    """Материалы «установлено на объект» — в оборудование адреса заявки.

    Без объекта у заявки отметка ничего не заводит (акт из офлайн-очереди
    не должен падать из-за этого). Аннулирование акта оборудование не
    убирает: его снимают с объекта руками, как и заводят."""
    if task.address_id is None:
        return []
    installed = []
    for line in act.lines:
        if not line.install_to_object:
            continue
        equipment = AddressEquipmentModel(
            address_id=task.address_id,
            equipment_type="other",
            name=line.name,
            serial_number=line.serial_number,
            quantity=max(1, int(line.qty)),
            install_date=act.created_at,
            status=EquipmentStatus.WORKING.value,
            notes=f"Установлено по акту №{act.number}",
        )
        db.add(equipment)
        db.flush()
        line.equipment_id = equipment.id
        db.add(
            AddressHistoryModel(
                address_id=task.address_id,
                event_type=AddressHistoryEventType.EQUIPMENT_ADDED.value,
                description=f"Установлено по акту №{act.number}: {line.name}",
                user_id=user.id,
            )
        )
        installed.append(line.name)
    return installed


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


def _store_signature(organization_id: int, png: bytes) -> Tuple[str, str]:
    """Сохранить подпись (PNG до 1 МБ). Возвращает (путь в acts_dir, SHA-256)."""
    if len(png) > MAX_SIGNATURE_BYTES:
        raise ActServiceError("Подпись больше 1 МБ", 413)
    try:
        with Image.open(BytesIO(png)) as image:
            if image.format != "PNG":
                raise ActServiceError("Подпись — PNG", 415)
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        # Pillow отвечает на битый PNG (неверная контрольная сумма) SyntaxError
        raise ActServiceError("Не удалось прочитать подпись", 415)
    digest = hashlib.sha256(png).hexdigest()
    relative = Path(str(organization_id)) / f"sig-{digest[:24]}.png"
    target = acts_dir() / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(png)
    return relative.as_posix(), digest


def _signed_moment(claimed: Optional[datetime], now: datetime) -> datetime:
    if claimed is None:
        return now
    if claimed.tzinfo is None:
        claimed = claimed.replace(tzinfo=timezone.utc)
    if not now - _SIGNED_AT_PAST <= claimed <= now + _SIGNED_AT_FUTURE:
        return now
    return claimed


def create_act(
    db: Session,
    task: TaskModel,
    data: ActCreate,
    user: UserModel,
    signing: Optional[ActSigning] = None,
    stage: Optional[Callable[[ActModel], None]] = None,
) -> ActModel:
    """Выпустить акт по заявке: номер, снимки, хеш.

    Без signing — ждёт подписи (печать, скан). С подписью клиента — подписан
    на экране; с причиной отказа — отказ. stage вызывается после flush, до
    коммита: так ответ для Idempotency-Key сохраняется в той же транзакции."""
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

    status, signatures, signed_at = PENDING, {}, None
    customer_file = worker_file = None
    if signing is not None:
        if signing.worker_png:
            worker_file, signatures["worker"] = _store_signature(
                organization_id, signing.worker_png
            )
        if signing.customer_png:
            customer_file, signatures["customer"] = _store_signature(
                organization_id, signing.customer_png
            )
            status = SIGNED
            signed_at = _signed_moment(signing.signed_at, issued_at)
            content["signature"] = {
                "via": "screen",
                "signed_local": signed_at.astimezone(business_tz()).strftime(
                    "%d.%m.%Y %H:%M"
                ),
            }
        elif signing.refusal_reason:
            status = REFUSED
            content["refusal_reason"] = signing.refusal_reason

    act = ActModel(
        organization_id=organization_id,
        task_id=task.id,
        number=number,
        kind="task",
        status=status,
        signed_via="screen" if status == SIGNED else None,
        signed_at=to_naive_utc(signed_at) if signed_at else None,
        customer_signature_file=customer_file,
        worker_signature_file=worker_file,
        signature_strokes=signing.strokes if signing and customer_file else None,
        sign_lat=signing.lat if signing else None,
        sign_lon=signing.lon if signing else None,
        sign_device=signing.device if signing else None,
        refusal_reason=content.get("refusal_reason"),
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
        document_hash=document_hash(content, requisites, signatures),
        supersedes_act_id=superseded.id if superseded else None,
        created_by_id=user.id,
        created_at=to_naive_utc(issued_at),
        lines=[ActLineModel(**line) for line in lines],
    )
    db.add(act)
    if superseded is not None:
        _cancel(superseded, f"Заменён актом №{number}", user)
    installed = _install_materials(db, task, act, user)
    text = f"Оформлен акт №{number} на сумму {total} ₽"
    if status == SIGNED:
        text += ", подписан клиентом на экране"
    elif status == REFUSED:
        text += f". Клиент отказался подписать: {content['refusal_reason']}"
    if installed:
        text += ". На объект установлено: " + ", ".join(installed)
    _comment(db, task.id, text, user)
    db.flush()
    if stage is not None:
        stage(act)
    db.commit()
    db.refresh(act)
    return act


def _cancel(act: ActModel, reason: str, user: UserModel) -> None:
    act.status = CANCELLED
    act.cancel_reason = reason
    act.cancelled_by_id = user.id
    act.cancelled_at = to_naive_utc(datetime.now(timezone.utc))
    # Аннулированный акт по ссылке не подписать и не скачать
    act.public_token_hash = None
    act.public_link_expires_at = None


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


def stored_file(relative: Optional[str]) -> Optional[Path]:
    """Файл акта (скан, подпись) по пути из БД — без выхода из каталога актов."""
    if not relative:
        return None
    base = acts_dir().resolve()
    path = (base / relative).resolve()
    if base not in path.parents or not path.is_file():
        return None
    return path


def scan_path(act: ActModel) -> Optional[Path]:
    return stored_file(act.scan_file)


# ------------------------------------------------------- ссылка для клиента


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_public_link(db: Session, act: ActModel) -> Tuple[str, datetime]:
    """Ссылка для клиента: подписать акт или забрать PDF подписанного.

    Токен показывается один раз — в БД только его хеш; новая ссылка
    заменяет прежнюю."""
    if act.status not in _LINKABLE:
        raise ActServiceError(
            "Ссылку дают на акт, который ждёт подписи или уже подписан", 400
        )
    if act.kind == "summary":
        # Сводный подписывает представитель УК — печать или скан, не ссылка
        raise ActServiceError("Для сводного акта ссылка клиенту не выдаётся", 400)
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + PUBLIC_LINK_TTL
    act.public_token_hash = _token_hash(token)
    act.public_link_expires_at = to_naive_utc(expires_at)
    db.commit()
    db.refresh(act)
    return token, expires_at


def act_by_public_token(
    db: Session, token: str, for_update: bool = False
) -> Optional[ActModel]:
    """Акт по токену ссылки; None — ссылка неверная, устарела или акт
    аннулирован."""
    if not token or len(token) > 128:
        return None
    query = db.query(ActModel).filter(ActModel.public_token_hash == _token_hash(token))
    if for_update:
        query = query.with_for_update()
    act = query.first()
    if act is None or act.status not in _LINKABLE:
        return None
    expires_at = act.public_link_expires_at
    if expires_at is None or expires_at <= to_naive_utc(datetime.now(timezone.utc)):
        return None
    return act


def _strokes(value: Any) -> Optional[list]:
    """Траектория росчерка [[[x, y, t], ...], ...] — без мусора и лишнего."""
    if not isinstance(value, list):
        return None
    points = 0
    for stroke in value:
        if not isinstance(stroke, list):
            return None
        for point in stroke:
            if not (
                isinstance(point, list)
                and len(point) == 3
                and all(isinstance(n, (int, float)) for n in point)
            ):
                return None
        points += len(stroke)
    return value if 0 < points <= MAX_STROKES_POINTS else None


def sign_by_link(
    db: Session,
    act: ActModel,
    png: bytes,
    strokes: Any,
    signer_name: str,
    ip: Optional[str] = None,
    device: Optional[str] = None,
) -> ActModel:
    """Клиент подписал акт по ссылке: подпись, ФИО, время сервера, IP и
    браузер. Хеш пересчитывается — в него входят подписи."""
    if act.status != PENDING:
        raise ActServiceError("Акт уже подписан", 409)
    name = " ".join(signer_name.split())[:200]
    if len(name) < 2:
        raise ActServiceError("Укажите фамилию и инициалы", 400)
    customer_file, customer_digest = _store_signature(act.organization_id, png)
    signatures = {"customer": customer_digest}
    worker_path = stored_file(act.worker_signature_file)
    if worker_path is not None:
        signatures["worker"] = hashlib.sha256(worker_path.read_bytes()).hexdigest()

    now = datetime.now(timezone.utc)
    content = copy.deepcopy(act.content_snapshot or {})
    content.setdefault("customer", {})["name"] = name
    content["signature"] = {
        "via": "link",
        "signed_local": now.astimezone(business_tz()).strftime("%d.%m.%Y %H:%M"),
    }
    act.content_snapshot = content
    act.customer_name = name
    act.customer_signature_file = customer_file
    act.signature_strokes = _strokes(strokes)
    act.status = SIGNED
    act.signed_via = "link"
    act.signed_at = to_naive_utc(now)
    act.sign_ip = (ip or "")[:64] or None
    act.sign_device = (device or "")[:100] or None
    act.document_hash = document_hash(
        content, act.requisites_snapshot or {}, signatures
    )
    if act.task_id is not None:
        db.add(
            CommentModel(
                task_id=act.task_id,
                text=f"Акт №{act.number} подписан клиентом по ссылке: {name}",
            )
        )
    db.commit()
    db.refresh(act)
    return act


def verify_act(db: Session, number: str, hash_prefix: str) -> Optional[ActModel]:
    """Акт по номеру и контрольной сумме из подвала распечатки (не меньше 16
    знаков). Номер без суммы не раскрывает ничего."""
    prefix = (hash_prefix or "").strip().lower()
    if not HASH_PREFIX_LENGTH <= len(prefix) <= 64 or any(
        char not in "0123456789abcdef" for char in prefix
    ):
        return None
    for act in db.query(ActModel).filter(ActModel.number == number.strip()).all():
        if hmac.compare_digest(act.document_hash[: len(prefix)], prefix):
            return act
    return None
