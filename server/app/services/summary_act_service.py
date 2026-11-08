"""
Сводный акт за месяц по контрагенту (УК/ТСЖ) — раздел 7.9 плана.

Это обычный акт (номер, снимки, хеш, PDF, скан подписанного, аннулирование)
вида ``summary`` без заявки. Состав за месяц:

- абонплата — системы объектов контрагента (активные или на ремонте),
  действующие хотя бы часть месяца, с ``monthly_cost`` > 0;
- работы — акты по заявкам его объектов с оплатой «по договору»
  (не аннулированные и не с отказом от подписи), выпущенные в месяце;
- справочно — выезды: выполненные за месяц заявки по его объектам.
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models import (
    ActLineModel,
    ActModel,
    AddressModel,
    AddressSystemModel,
    CounterpartyModel,
    OrganizationSettingsModel,
    TaskModel,
    TaskStatus,
    UserModel,
)
from app.services.act_service import (
    CANCELLED,
    PENDING,
    REFUSED,
    ActServiceError,
    _cancel,
    _money,
    _requisites,
    _user_name,
    document_hash,
    next_act_number,
)
from app.services.business_time import business_tz, to_naive_utc
from app.services.organization_settings_service import DEFAULT_ACT_NUMBER_PREFIX

SUMMARY = "summary"
BILLABLE_SYSTEM_STATUSES = ("active", "maintenance")
MONTHS = (
    "январь", "февраль", "март", "апрель", "май", "июнь",
    "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
)  # fmt: skip


def month_bounds(month: str) -> tuple[date, date]:
    first = date.fromisoformat(f"{month}-01")
    return first, first.replace(day=monthrange(first.year, first.month)[1])


def period_label(first: date) -> str:
    return f"{MONTHS[first.month - 1]} {first.year}"


def _utc_range(first: date, last: date) -> tuple[datetime, datetime]:
    """Месяц в бизнес-часовом поясе → наивные UTC-границы, как хранятся в БД."""
    tz = business_tz()
    start = datetime.combine(first, time.min, tzinfo=tz)
    end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=tz)
    return to_naive_utc(start), to_naive_utc(end)


def _local_day(value: datetime) -> date:
    moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return moment.astimezone(business_tz()).date()


def _addresses(db: Session, counterparty: CounterpartyModel) -> List[AddressModel]:
    return (
        db.query(AddressModel)
        .filter(
            AddressModel.counterparty_id == counterparty.id,
            AddressModel.organization_id == counterparty.organization_id,
        )
        .order_by(AddressModel.address)
        .all()
    )


def summary_content(db: Session, counterparty: CounterpartyModel, month: str) -> dict:
    """Содержимое сводного акта за месяц (без номера) — для предпросмотра и выпуска."""
    first, last = month_bounds(month)
    start, end = _utc_range(first, last)
    addresses = _addresses(db, counterparty)
    address_ids = [address.id for address in addresses]
    address_names = {address.id: address.address for address in addresses}

    lines: List[dict] = []
    subscription_total = Decimal("0.00")
    if address_ids:
        systems = (
            db.query(AddressSystemModel)
            .filter(
                AddressSystemModel.address_id.in_(address_ids),
                AddressSystemModel.status.in_(BILLABLE_SYSTEM_STATUSES),
                AddressSystemModel.monthly_cost > 0,
            )
            .order_by(AddressSystemModel.address_id, AddressSystemModel.id)
            .all()
        )
        for system in systems:
            started = system.service_start_date
            ended = system.service_end_date
            if started is not None and started.date() > last:
                continue
            if ended is not None and ended.date() < first:
                continue
            amount = _money(system.monthly_cost)
            subscription_total += amount
            lines.append(
                {
                    "kind": "subscription",
                    "name": f"Абонентское обслуживание: {system.name}",
                    "details": " · ".join(
                        part
                        for part in (
                            address_names.get(system.address_id),
                            (
                                f"договор {system.contract_number}"
                                if system.contract_number
                                else None
                            ),
                        )
                        if part
                    ),
                    "amount": amount,
                }
            )

    acts_total = Decimal("0.00")
    visits: List[dict] = []
    if address_ids:
        task_ids = db.query(TaskModel.id).filter(TaskModel.address_id.in_(address_ids))
        contract_acts = (
            db.query(ActModel)
            .filter(
                ActModel.organization_id == counterparty.organization_id,
                ActModel.kind != SUMMARY,
                ActModel.task_id.in_(task_ids),
                ActModel.payment_method == "contract",
                ActModel.status.notin_((CANCELLED, REFUSED)),
                ActModel.created_at >= start,
                ActModel.created_at < end,
            )
            .order_by(ActModel.created_at, ActModel.id)
            .all()
        )
        for act in contract_acts:
            amount = _money(act.total_amount or 0)
            if amount <= 0:
                continue
            acts_total += amount
            task = (act.content_snapshot or {}).get("task") or {}
            lines.append(
                {
                    "kind": "act",
                    "name": f"Работы по акту № {act.number} от "
                    f"{_local_day(act.created_at).strftime('%d.%m.%Y')}",
                    "details": " · ".join(
                        part
                        for part in (task.get("address"), task.get("defect_type"))
                        if part
                    ),
                    "amount": amount,
                }
            )

        done = (
            db.query(TaskModel)
            .options(joinedload(TaskModel.assigned_user))
            .filter(
                TaskModel.address_id.in_(address_ids),
                TaskModel.status == TaskStatus.DONE.value,
                TaskModel.completed_at >= start,
                TaskModel.completed_at < end,
            )
            .order_by(TaskModel.completed_at, TaskModel.id)
            .all()
        )
        for task in done:
            visits.append(
                {
                    "date": _local_day(task.completed_at).strftime("%d.%m.%Y"),
                    "task_id": task.id,
                    "task_number": task.task_number or f"Z-{task.id:05d}",
                    "address": task.raw_address,
                    "title": task.defect_type or task.title,
                    "worker": _user_name(task.assigned_user),
                    "remote": bool(task.is_remote),
                }
            )

    for position, line in enumerate(lines, start=1):
        line["position"] = position

    return {
        "month": month,
        "period_label": period_label(first),
        "lines": lines,
        "visits": visits,
        "subscription_total": subscription_total,
        "acts_total": acts_total,
        "total": subscription_total + acts_total,
    }


def existing_summary_act(
    db: Session, counterparty: CounterpartyModel, month: str
) -> Optional[ActModel]:
    first, _ = month_bounds(month)
    return (
        db.query(ActModel)
        .filter(
            ActModel.kind == SUMMARY,
            ActModel.counterparty_id == counterparty.id,
            ActModel.period_start == first,
            ActModel.status != CANCELLED,
        )
        .order_by(ActModel.id.desc())
        .first()
    )


def _counterparty_snapshot(counterparty: CounterpartyModel) -> dict:
    fields = (
        "name",
        "legal_name",
        "inn",
        "kpp",
        "ogrn",
        "legal_address",
        "bank_name",
        "bik",
        "account",
        "corr_account",
        "contract_number",
        "contract_date",
        "signer_name",
        "signer_position",
    )
    return {field: getattr(counterparty, field) for field in fields}


def issue_summary_act(
    db: Session,
    counterparty: CounterpartyModel,
    month: str,
    user: UserModel,
    supersedes_act_id: Optional[int] = None,
) -> ActModel:
    """Выпустить сводный акт за месяц. Второй действующий за тот же месяц —
    только исправленной версией (прежний аннулируется)."""
    first, _ = month_bounds(month)
    existing = existing_summary_act(db, counterparty, month)
    if existing is not None and existing.id != supersedes_act_id:
        raise ActServiceError(
            f"За {period_label(first)} уже выпущен акт № {existing.number} — "
            "исправьте его или аннулируйте",
            409,
        )
    superseded = existing if supersedes_act_id is not None else None
    if supersedes_act_id is not None and superseded is None:
        raise ActServiceError("Исправляемый акт не найден или уже аннулирован", 400)

    built = summary_content(db, counterparty, month)
    if not built["lines"]:
        raise ActServiceError(
            "За месяц нечего выставить: нет абонплаты по объектам и актов «по договору»",
            400,
        )

    organization_id = counterparty.organization_id
    issued_at = datetime.now(timezone.utc)
    settings_row = db.get(OrganizationSettingsModel, organization_id)
    prefix = (
        settings_row.act_number_prefix if settings_row else None
    ) or DEFAULT_ACT_NUMBER_PREFIX
    number = next_act_number(
        db, organization_id, issued_at.astimezone(business_tz()).year, prefix
    )
    # Счётчик номеров заблокирован до коммита: параллельный выпуск за тот же
    # месяц (двойной клик, две вкладки) ждал здесь и уже прошёл проверку выше.
    # Перепроверяем под блокировкой — иначе за месяц выходило два акта.
    current = existing_summary_act(db, counterparty, month)
    if (current.id if current else None) != (existing.id if existing else None):
        raise ActServiceError(
            f"За {period_label(first)} акт № {current.number} только что выпущен "
            "другим запросом — обновите страницу",
            409,
        )
    snapshot = _counterparty_snapshot(counterparty)
    signer = snapshot.get("signer_name")
    content = {
        "kind": SUMMARY,
        "number": number,
        "issued_at": issued_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "issued_local": issued_at.astimezone(business_tz()).strftime("%d.%m.%Y"),
        "issued_by": _user_name(user),
        "month": month,
        "period_label": built["period_label"],
        "counterparty": snapshot,
        "customer": {"name": signer, "role": "uk_rep"},
        "lines": [
            {
                "position": line["position"],
                "line_type": "work",
                "kind": line["kind"],
                "name": line["name"],
                "details": line["details"] or None,
                "unit": "мес" if line["kind"] == "subscription" else "акт",
                "qty": "1",
                "price": str(line["amount"]),
                "amount": str(line["amount"]),
            }
            for line in built["lines"]
        ],
        "visits": built["visits"],
        "subscription_total": str(built["subscription_total"]),
        "acts_total": str(built["acts_total"]),
        "total": str(built["total"]),
        "payment_method": "contract",
        "no_claims": True,
    }
    requisites = _requisites(db, organization_id)

    act = ActModel(
        organization_id=organization_id,
        task_id=None,
        number=number,
        kind=SUMMARY,
        status=PENDING,
        counterparty_id=counterparty.id,
        period_start=first,
        customer_name=signer,
        customer_role="uk_rep",
        payment_method="contract",
        total_amount=built["total"],
        no_claims=True,
        content_snapshot=content,
        requisites_snapshot=requisites,
        document_hash=document_hash(content, requisites),
        supersedes_act_id=superseded.id if superseded else None,
        created_by_id=user.id,
        created_at=to_naive_utc(issued_at),
        lines=[
            ActLineModel(
                position=line["position"],
                line_type="work",
                name=line["name"][:200],
                unit="мес" if line["kind"] == "subscription" else "акт",
                qty=Decimal("1"),
                price=line["amount"],
                amount=line["amount"],
            )
            for line in built["lines"]
        ],
    )
    db.add(act)
    if superseded is not None:
        _cancel(superseded, f"Заменён актом №{number}", user)
    db.commit()
    db.refresh(act)
    return act
