"""
Act PDF
=======
PDF акта выполненных работ (ReportLab). Рисуется только из снимков акта —
content_snapshot и requisites_snapshot, — поэтому один и тот же акт всегда
выглядит одинаково, как бы ни менялись заявка, прайс и реквизиты.

Шрифт — DejaVu Sans (кириллица, свободная лицензия) из app/assets/fonts.
"""

from decimal import Decimal
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models import ActModel

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
FONT = "DejaVuSans"
FONT_BOLD = "DejaVuSans-Bold"

CUSTOMER_ROLES = {
    "resident": "жилец",
    "chairman": "председатель",
    "uk_rep": "представитель УК",
    "other": "заказчик",
}
PAYMENT_METHODS = {
    "cash": "наличными",
    "card": "картой",
    "transfer": "переводом",
    "contract": "по договору",
    "none": "без оплаты",
}


@lru_cache(maxsize=None)
def _register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(FONT, str(FONTS_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONTS_DIR / "DejaVuSans-Bold.ttf")))


def _style(name: str, size: float = 9, bold: bool = False, **kwargs) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=FONT_BOLD if bold else FONT,
        fontSize=size,
        leading=size * 1.3,
        **kwargs,
    )


TEXT = _style("text")
SMALL = _style("small", 7.5, textColor=colors.HexColor("#555555"))
BOLD = _style("bold", bold=True)
TITLE = _style("title", 13, bold=True, alignment=TA_CENTER, spaceAfter=1 * mm)
SUBTITLE = _style("subtitle", 9, alignment=TA_CENTER)
RIGHT = _style("right", alignment=TA_RIGHT)
RIGHT_BOLD = _style("right_bold", bold=True, alignment=TA_RIGHT)


def _p(text: Optional[str], style: ParagraphStyle = TEXT) -> Paragraph:
    return Paragraph(escape(text or "").replace("\n", "<br/>"), style)


def money(value) -> str:
    """«1 500,00»"""
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"))
    whole, frac = f"{amount:.2f}".split(".")
    sign = "-" if whole.startswith("-") else ""
    whole = whole.lstrip("-")
    groups = []
    while whole:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    return f"{sign}{' '.join(groups) or '0'},{frac}"


def _qty(value: str) -> str:
    return value.replace(".", ",")


def _header(requisites: dict) -> List:
    name = requisites.get("legal_name") or requisites.get("organization_name") or ""
    ids = "  ".join(
        f"{label} {requisites[key]}"
        for key, label in (("inn", "ИНН"), ("kpp", "КПП"), ("ogrn", "ОГРН"))
        if requisites.get(key)
    )
    bank = ", ".join(
        part
        for part in (
            f"р/с {requisites['account']}" if requisites.get("account") else "",
            requisites.get("bank_name") or "",
            f"БИК {requisites['bik']}" if requisites.get("bik") else "",
            (
                f"к/с {requisites['corr_account']}"
                if requisites.get("corr_account")
                else ""
            ),
        )
        if part
    )
    flow = [_p(name, BOLD)]
    for line in (ids, requisites.get("legal_address"), bank):
        if line:
            flow.append(_p(line, SMALL))
    return flow + [Spacer(1, 5 * mm)]


def _info(content: dict) -> Table:
    task = content.get("task") or {}
    customer = content.get("customer") or {}
    customer_line = customer.get("name") or "—"
    if customer.get("role"):
        customer_line += f" ({CUSTOMER_ROLES.get(customer['role'], customer['role'])})"
    rows = [
        ("Заявка", f"№{task.get('number', '')}"),
        ("Адрес", task.get("address")),
        ("Квартира", customer.get("apartment")),
        ("Неисправность", task.get("defect_type")),
        ("Заказчик", customer_line),
        ("Исполнитель", content.get("worker") or content.get("issued_by")),
    ]
    table = Table(
        [[_p(label, SMALL), _p(value)] for label, value in rows if value],
        colWidths=[32 * mm, None],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
            ]
        )
    )
    return table


def _lines(content: dict) -> List:
    lines = content.get("lines") or []
    if not lines:
        return []
    header = ["№", "Наименование", "Кол-во", "Ед.", "Цена, ₽", "Сумма, ₽"]
    rows = [[_p(cell, BOLD) for cell in header]]
    for line in lines:
        name = line["name"]
        if line.get("line_type") == "material":
            name += " (материал)"
        if line.get("serial_number"):
            name += f", с/н {line['serial_number']}"
        rows.append(
            [
                _p(str(line["position"])),
                _p(name),
                _p(_qty(line["qty"]), RIGHT),
                _p(line["unit"]),
                _p(money(line["price"]), RIGHT),
                _p(money(line["amount"]), RIGHT),
            ]
        )
    rows.append(
        ["", _p("Итого", BOLD), "", "", "", _p(money(content["total"]), RIGHT_BOLD)]
    )
    table = Table(
        rows,
        colWidths=[9 * mm, None, 18 * mm, 13 * mm, 24 * mm, 26 * mm],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -2), 0.4, colors.HexColor("#999999")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("SPAN", (1, -1), (4, -1)),
            ]
        )
    )
    return [table, Spacer(1, 2 * mm)]


def _signatures(content: dict) -> Table:
    customer = (content.get("customer") or {}).get("name") or ""
    worker = content.get("worker") or content.get("issued_by") or ""
    line = "_" * 24
    table = Table(
        [
            [_p("Исполнитель", SMALL), _p("Заказчик", SMALL)],
            [_p(f"{line} / {worker}"), _p(f"{line} / {customer}")],
        ],
        colWidths=["50%", "50%"],
    )
    table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 1), (-1, 1), 8 * mm),
            ]
        )
    )
    return table


def render_act_pdf(act: ActModel) -> bytes:
    _register_fonts()
    content = act.content_snapshot or {}
    requisites = act.requisites_snapshot or {}
    buffer = BytesIO()
    footer = f"Акт № {act.number} · контрольная сумма {act.document_hash[:16]}"

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(colors.HexColor("#777777"))
        canvas.drawString(15 * mm, 10 * mm, footer)
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"стр. {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=18 * mm,
        title=f"Акт {act.number}",
        author=requisites.get("legal_name")
        or requisites.get("organization_name")
        or "",
    )

    flow = _header(requisites)
    flow += [
        _p(f"АКТ ВЫПОЛНЕННЫХ РАБОТ № {act.number}", TITLE),
        _p(f"от {content.get('issued_local', '')}", SUBTITLE),
        Spacer(1, 5 * mm),
        _info(content),
        Spacer(1, 4 * mm),
    ]
    flow += _lines(content)
    total = Decimal(str(content.get("total") or 0))
    if total > 0:
        method = PAYMENT_METHODS.get(content.get("payment_method"), "")
        flow.append(_p(f"Сумма к оплате: {money(total)} ₽, оплата {method}.", BOLD))
        flow.append(Spacer(1, 2 * mm))
    if content.get("work_summary"):
        flow += [
            _p("Выполненные работы:", BOLD),
            _p(content["work_summary"]),
            Spacer(1, 2 * mm),
        ]
    if content.get("no_claims"):
        flow.append(
            _p(
                "Работы выполнены в полном объёме. Заказчик претензий по объёму, "
                "качеству и срокам выполнения работ не имеет."
            )
        )
    if content.get("customer_remarks"):
        flow += [
            Spacer(1, 2 * mm),
            _p("Замечания заказчика:", BOLD),
            _p(content["customer_remarks"]),
        ]
    flow += [Spacer(1, 6 * mm), KeepTogether([_signatures(content)])]
    if requisites.get("act_footer_text"):
        flow += [Spacer(1, 6 * mm), _p(requisites["act_footer_text"], SMALL)]

    doc.build(flow, onFirstPage=on_page, onLaterPages=on_page)
    return buffer.getvalue()
