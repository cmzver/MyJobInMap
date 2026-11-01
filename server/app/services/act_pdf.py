"""
Act PDF
=======
PDF акта выполненных работ (ReportLab). Рисуется только из снимков акта —
content_snapshot и requisites_snapshot (в нём и бланк организации, и её
логотип), — поэтому выпущенный акт всегда выглядит одинаково, как бы ни
менялись заявка, прайс, реквизиты и бланк.

Шрифт — DejaVu Sans (кириллица, свободная лицензия) из app/assets/fonts.
"""

from datetime import datetime
from decimal import Decimal
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models import ActModel
from app.schemas.organization_settings import ActTemplate
from app.services.act_service import stored_file
from app.services.business_time import business_tz
from app.services.organization_settings_service import logo_path

FONTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
FONT = "DejaVuSans"
FONT_BOLD = "DejaVuSans-Bold"

MUTED = colors.HexColor("#6B7280")
RULE = colors.HexColor("#E5E7EB")
PANEL = colors.HexColor("#F7F7F8")
ZEBRA = colors.HexColor("#FAFAFA")

CUSTOMER_ROLES = {
    "resident": "жилец",
    "chairman": "председатель",
    "uk_rep": "представитель УК",
    "other": "",
}
PAYMENT_METHODS = {
    "cash": "наличными",
    "card": "картой",
    "transfer": "переводом",
    "contract": "по договору",
    "none": "без оплаты",
}

# Ширина текста: поля 16 мм и внутренний отступ рамки ReportLab по 6 pt.
PAGE_WIDTH = A4[0] - 32 * mm - 12
# Подпись с экрана вписываем в эту рамку над линией.
SIGNATURE_BOX = (60 * mm, 18 * mm)


@lru_cache(maxsize=None)
def _register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(FONT, str(FONTS_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, str(FONTS_DIR / "DejaVuSans-Bold.ttf")))


def _style(name: str, size: float = 9, bold: bool = False, **kwargs) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        fontName=FONT_BOLD if bold else FONT,
        fontSize=size,
        leading=size * 1.35,
        **kwargs,
    )


TEXT = _style("text")
SMALL = _style("small", 7.5, textColor=MUTED)
LABEL = _style("label", 7, textColor=MUTED)
BOLD = _style("bold", bold=True)
ORG = _style("org", 11, bold=True)
RIGHT = _style("right", alignment=TA_RIGHT)
RIGHT_SMALL = _style("right_small", 8, textColor=MUTED, alignment=TA_RIGHT)
TOTAL = _style("total", 12, bold=True, alignment=TA_RIGHT)


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


def _section(title: str) -> Paragraph:
    return _p(title.upper(), LABEL)


def _logo(relative: Optional[str]) -> Optional[Image]:
    path = logo_path(relative)
    if path is None:
        return None
    width, height = ImageReader(str(path)).getSize()
    scale = min(45 * mm / width, 20 * mm / height)
    return Image(str(path), width=width * scale, height=height * scale)


def _header(requisites: dict, template: ActTemplate) -> List:
    name = requisites.get("legal_name") or requisites.get("organization_name") or ""
    ids = " · ".join(
        f"{label} {requisites[key]}"
        for key, label in (("inn", "ИНН"), ("kpp", "КПП"), ("ogrn", "ОГРН"))
        if requisites.get(key)
    )
    bank = ""
    if template.show_bank_details:
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
    block = [_p(name, ORG)] + [
        _p(line, SMALL)
        for line in (ids, requisites.get("legal_address"), bank, template.contacts)
        if line
    ]
    logo = _logo(requisites.get("logo_file"))
    if logo is None:
        header = block
    else:
        table = Table([[logo, block]], colWidths=[50 * mm, PAGE_WIDTH - 50 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        header = [table]
    return header + [
        Spacer(1, 3 * mm),
        HRFlowable(
            width="100%", thickness=1.2, color=colors.HexColor(template.accent_color)
        ),
        Spacer(1, 4 * mm),
    ]


def _title(number: str, content: dict, template: ActTemplate) -> Table:
    accent = colors.HexColor(template.accent_color)
    title = _style("title", 16, bold=True, textColor=accent)
    table = Table(
        [
            [
                _p(template.title, title),
                [
                    _p(f"№ {number}", _style("num", 10, bold=True, alignment=TA_RIGHT)),
                    _p(f"от {content.get('issued_local', '')}", RIGHT_SMALL),
                ],
            ]
        ],
        colWidths=[PAGE_WIDTH - 60 * mm, 60 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _info(content: dict) -> Table:
    task = content.get("task") or {}
    customer = content.get("customer") or {}
    customer_name = customer.get("name") or "—"
    role = CUSTOMER_ROLES.get(customer.get("role") or "", "")
    if role:
        customer_name += f", {role}"
    left = [
        ("Заявка", f"№ {task.get('number', '')}"),
        ("Адрес", task.get("address")),
        ("Неисправность", task.get("defect_type")),
    ]
    right = [
        ("Заказчик", customer_name),
        ("Квартира", customer.get("apartment")),
        ("Исполнитель", content.get("worker") or content.get("issued_by")),
    ]

    def cell(pairs):
        flow = []
        for label, value in pairs:
            if value:
                flow += [_p(label, LABEL), _p(value), Spacer(1, 1.5 * mm)]
        return flow

    table = Table(
        [[cell(left), cell(right)]], colWidths=[PAGE_WIDTH * 0.55, PAGE_WIDTH * 0.45]
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5 * mm),
            ]
        )
    )
    return table


def _lines(content: dict, template: ActTemplate) -> List:
    lines = content.get("lines") or []
    if not lines:
        return []
    accent = colors.HexColor(template.accent_color)
    head = _style("head", 8, bold=True, textColor=colors.white)
    head_right = _style(
        "head_right", 8, bold=True, textColor=colors.white, alignment=TA_RIGHT
    )
    header = [
        _p("№", head),
        _p("Наименование", head),
        _p("Кол-во", head_right),
        _p("Ед.", head),
    ]
    fixed = [18 * mm, 13 * mm]
    if template.show_prices:
        header += [_p("Цена, ₽", head_right), _p("Сумма, ₽", head_right)]
        fixed += [24 * mm, 26 * mm]
    widths = [9 * mm, PAGE_WIDTH - 9 * mm - sum(fixed), *fixed]
    rows = [header]
    for line in lines:
        name = [_p(line["name"])]
        details = []
        if line.get("line_type") == "material":
            details.append("материал")
        if line.get("serial_number"):
            details.append(f"с/н {line['serial_number']}")
        if details:
            name.append(_p(" · ".join(details), SMALL))
        row = [
            _p(str(line["position"])),
            name,
            _p(_qty(line["qty"]), RIGHT),
            _p(line["unit"]),
        ]
        if template.show_prices:
            row += [_p(money(line["price"]), RIGHT), _p(money(line["amount"]), RIGHT)]
        rows.append(row)
    table = Table(rows, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), accent),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]
    style += [
        ("BACKGROUND", (0, row), (-1, row), ZEBRA) for row in range(2, len(rows), 2)
    ]
    table.setStyle(TableStyle(style))
    return [table]


def _totals(content: dict, template: ActTemplate) -> List:
    total = Decimal(str(content.get("total") or 0))
    if not template.show_prices or total <= 0:
        return []
    method = PAYMENT_METHODS.get(content.get("payment_method") or "none", "")
    return [
        Spacer(1, 3 * mm),
        _p(f"Итого: {money(total)} ₽", TOTAL),
        _p(f"Оплата {method}", RIGHT_SMALL),
    ]


def _signature_image(path: Optional[Path]) -> Optional[Image]:
    if path is None:
        return None
    width, height = ImageReader(str(path)).getSize()
    scale = min(SIGNATURE_BOX[0] / width, SIGNATURE_BOX[1] / height)
    return Image(str(path), width=width * scale, height=height * scale, hAlign="LEFT")


def _signatures(
    content: dict, template: ActTemplate, signature_files: Optional[dict] = None
) -> Table:
    customer = (content.get("customer") or {}).get("name") or ""
    worker = content.get("worker") or content.get("issued_by") or ""
    files = signature_files or {}

    def column(label: str, name: str, image: Optional[Image], notes: List[str]) -> List:
        flow = [
            _p(label.upper(), LABEL),
            image if image is not None else Spacer(1, 12 * mm),
            HRFlowable(width="90%", thickness=0.6, color=colors.black, hAlign="LEFT"),
            _p(name or " ", SMALL),
        ]
        return flow + [_p(note, SMALL) for note in notes]

    customer_notes = []
    if content.get("signature"):
        customer_notes.append(
            f"Подписано на экране {content['signature'].get('signed_local', '')}"
        )
    if content.get("refusal_reason"):
        customer_notes.append(f"От подписи отказался: {content['refusal_reason']}")

    table = Table(
        [
            [
                column(
                    template.executor_label,
                    worker,
                    _signature_image(files.get("executor")),
                    ["М.П."] if template.show_stamp_place else [],
                ),
                column(
                    template.customer_label,
                    customer,
                    _signature_image(files.get("customer")),
                    customer_notes,
                ),
            ]
        ],
        colWidths=[PAGE_WIDTH / 2, PAGE_WIDTH / 2],
    )
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def render_act_document(
    number: str,
    content: dict,
    requisites: dict,
    document_hash: str,
    signature_files: Optional[dict] = None,
) -> bytes:
    _register_fonts()
    template = ActTemplate(**(requisites.get("template") or {}))
    buffer = BytesIO()
    footer = f"Акт № {number} · контрольная сумма {document_hash[:16]}"

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont(FONT, 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 10 * mm, footer)
        canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"стр. {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
        title=f"{template.title} {number}",
        author=requisites.get("legal_name")
        or requisites.get("organization_name")
        or "",
    )

    flow = _header(requisites, template)
    flow += [
        _title(number, content, template),
        Spacer(1, 5 * mm),
        _info(content),
        Spacer(1, 5 * mm),
    ]
    flow += _lines(content, template)
    flow += _totals(content, template)
    if content.get("work_summary"):
        flow += [
            Spacer(1, 5 * mm),
            _section("Выполненные работы"),
            _p(content["work_summary"]),
        ]
    if content.get("no_claims"):
        flow += [Spacer(1, 4 * mm), _p(template.acceptance_text)]
    if content.get("customer_remarks"):
        flow += [
            Spacer(1, 4 * mm),
            _section("Замечания заказчика"),
            _p(content["customer_remarks"]),
        ]
    flow += [
        Spacer(1, 8 * mm),
        KeepTogether([_signatures(content, template, signature_files)]),
    ]
    if requisites.get("act_footer_text"):
        flow += [Spacer(1, 8 * mm), _p(requisites["act_footer_text"], SMALL)]

    doc.build(flow, onFirstPage=on_page, onLaterPages=on_page)
    return buffer.getvalue()


def render_act_pdf(act: ActModel) -> bytes:
    return render_act_document(
        act.number,
        act.content_snapshot or {},
        act.requisites_snapshot or {},
        act.document_hash,
        {
            "executor": stored_file(act.worker_signature_file),
            "customer": stored_file(act.customer_signature_file),
        },
    )


def sample_act_content(number: str) -> dict:
    """Образец акта для предпросмотра бланка."""
    return {
        "number": number,
        "issued_local": datetime.now(business_tz()).strftime("%d.%m.%Y"),
        "task": {
            "number": "Z-00042",
            "address": "ул. Невская, д. 9, подъезд 2",
            "defect_type": "Не работает абонентская трубка",
        },
        "worker": "Иванов Иван Иванович",
        "customer": {"name": "Петров П. П.", "role": "resident", "apartment": "45"},
        "work_summary": "Заменена абонентская трубка, проверены связь с панелью и открывание двери.",
        "customer_remarks": None,
        "no_claims": True,
        "payment_method": "cash",
        "lines": [
            {
                "position": 1,
                "line_type": "work",
                "name": "Замена абонентской трубки",
                "unit": "шт",
                "qty": "1",
                "price": "1500.00",
                "amount": "1500.00",
            },
            {
                "position": 2,
                "line_type": "material",
                "name": "Трубка домофонная",
                "unit": "шт",
                "qty": "1",
                "price": "1290.00",
                "amount": "1290.00",
                "serial_number": "VZ-778812",
            },
        ],
        "total": "2790.00",
    }
