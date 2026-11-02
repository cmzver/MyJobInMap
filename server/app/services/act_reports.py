"""
Отчёты по актам (фаза 4d): деньги за период, реестр в Excel, архив за месяц.

Деньги считаются по актам, а не по заявкам: сумму и способ оплаты фиксирует
акт. Аннулированные акты в деньгах не участвуют — их заменили новые версии.
"""

from __future__ import annotations

import io
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timezone
from decimal import Decimal
from typing import Dict, Iterable, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.models import ActModel
from app.services.act_pdf import render_act_pdf
from app.services.act_service import scan_path
from app.services.business_time import business_tz

STATUS_LABELS = {
    "pending_signature": "Ждёт подписи",
    "signed": "Подписан",
    "refused": "Отказ от подписи",
    "cancelled": "Аннулирован",
}
PAYMENT_LABELS = {
    "cash": "Наличные",
    "card": "Карта",
    "transfer": "Перевод",
    "contract": "По договору",
    "none": "Без оплаты",
}
SIGNED_VIA_LABELS = {"screen": "на экране", "paper": "на бумаге", "link": "по ссылке"}
PAYMENT_ORDER = ("cash", "card", "transfer", "contract", "none")

# Архив за месяц собирается в памяти — ограничиваем размер разумным месяцем.
MAX_ARCHIVE_ACTS = 1000


@dataclass
class WorkerMoney:
    name: str
    acts: int = 0
    total: Decimal = Decimal("0")
    by_method: Dict[str, Decimal] = field(default_factory=lambda: defaultdict(Decimal))


@dataclass
class ActsSummary:
    issued: int = 0
    signed: int = 0
    pending: int = 0
    refused: int = 0
    total: Decimal = Decimal("0")
    by_method: Dict[str, Decimal] = field(default_factory=lambda: defaultdict(Decimal))
    count_by_method: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    workers: Dict[str, WorkerMoney] = field(default_factory=dict)


def worker_name(act: ActModel) -> str:
    """Кто был на выезде: исполнитель заявки на момент акта, иначе — кто выпустил."""
    content = act.content_snapshot or {}
    return content.get("worker") or content.get("issued_by") or "—"


def summarize(acts: Iterable[ActModel]) -> ActsSummary:
    summary = ActsSummary()
    for act in acts:
        if act.status == "cancelled":
            continue
        amount = Decimal(act.total_amount or 0)
        method = act.payment_method or "none"
        summary.issued += 1
        if act.status == "signed":
            summary.signed += 1
        elif act.status == "pending_signature":
            summary.pending += 1
        elif act.status == "refused":
            summary.refused += 1
        summary.total += amount
        summary.by_method[method] += amount
        summary.count_by_method[method] += 1
        name = worker_name(act)
        worker = summary.workers.setdefault(name, WorkerMoney(name=name))
        worker.acts += 1
        worker.total += amount
        worker.by_method[method] += amount
    return summary


def _local(value) -> str:
    if value is None:
        return ""
    # В БД — наивное UTC
    moment = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return moment.astimezone(business_tz()).strftime("%d.%m.%Y %H:%M")


def _style_header(ws, widths: List[int]) -> None:
    fill = PatternFill("solid", fgColor="F3F4F6")
    for index, width in enumerate(widths, start=1):
        cell = ws.cell(row=1, column=index)
        cell.font = Font(bold=True)
        cell.fill = fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(index)].width = width
    ws.freeze_panes = "A2"


def acts_workbook(acts: List[ActModel]) -> bytes:
    """Реестр актов: лист «Акты», лист «Строки» и итоги по способам оплаты."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Акты"
    headers = [
        ("Номер", 18),
        ("Выпущен", 17),
        ("Статус", 16),
        ("Подписан", 22),
        ("Заявка", 12),
        ("Адрес", 40),
        ("Заказчик", 24),
        ("Исполнитель", 22),
        ("Оплата", 13),
        ("Сумма, ₽", 12),
    ]
    ws.append([title for title, _ in headers])
    _style_header(ws, [width for _, width in headers])
    for act in acts:
        task = (act.content_snapshot or {}).get("task") or {}
        signed = ""
        if act.status == "signed":
            signed = f"{_local(act.signed_at)} {SIGNED_VIA_LABELS.get(act.signed_via or '', '')}".strip()
        ws.append(
            [
                act.number,
                _local(act.created_at),
                STATUS_LABELS.get(act.status, act.status),
                signed,
                task.get("number") or "",
                task.get("address") or "",
                act.customer_name or "",
                worker_name(act),
                PAYMENT_LABELS.get(act.payment_method, act.payment_method),
                float(act.total_amount or 0),
            ]
        )
        ws.cell(row=ws.max_row, column=10).number_format = "#,##0.00"

    summary = summarize(acts)
    ws.append([])
    ws.append(
        [
            "Итого (без аннулированных)",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            float(summary.total),
        ]
    )
    ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    ws.cell(row=ws.max_row, column=10).font = Font(bold=True)
    ws.cell(row=ws.max_row, column=10).number_format = "#,##0.00"
    for method in PAYMENT_ORDER:
        if summary.count_by_method.get(method):
            ws.append(
                [
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    PAYMENT_LABELS[method],
                    float(summary.by_method[method]),
                ]
            )
            ws.cell(row=ws.max_row, column=10).number_format = "#,##0.00"

    lines = wb.create_sheet("Строки")
    line_headers = [
        ("Акт", 18),
        ("Тип", 10),
        ("Наименование", 44),
        ("Кол-во", 9),
        ("Ед.", 7),
        ("Цена", 11),
        ("Сумма", 12),
        ("S/N", 18),
        ("На объект", 11),
    ]
    lines.append([title for title, _ in line_headers])
    _style_header(lines, [width for _, width in line_headers])
    for act in acts:
        for line in act.lines:
            lines.append(
                [
                    act.number,
                    "материал" if line.line_type == "material" else "работа",
                    line.name,
                    float(line.qty),
                    line.unit,
                    float(line.price),
                    float(line.amount),
                    line.serial_number or "",
                    "да" if line.install_to_object else "",
                ]
            )

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _safe_name(text: str) -> str:
    # Префикс номера настраивается и может содержать «/» — в имени файла нельзя
    return re.sub(r'[\\/:*?"<>|]+', "-", text).strip() or "act"


def acts_archive(acts: List[ActModel], base_url: Optional[str]) -> bytes:
    """ZIP: PDF каждого акта, сканы подписанных на бумаге и реестр Excel."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for act in acts:
            name = _safe_name(act.number)
            archive.writestr(f"{name}.pdf", render_act_pdf(act, base_url))
            scan = scan_path(act)
            if scan is not None and scan.exists():
                archive.write(scan, f"{name} — скан{scan.suffix}")
        archive.writestr("Реестр актов.xlsx", acts_workbook(acts))
    return buffer.getvalue()
