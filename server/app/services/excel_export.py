"""
Excel Export Service
====================
Экспорт заявок в формат Excel (xlsx) с форматированием.
"""

import io
import logging
from datetime import datetime, timezone
from typing import Optional, List

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session, joinedload

from app.models import TaskModel, TaskStatus, UserModel
from app.services.tenant_filter import TenantFilter

logger = logging.getLogger(__name__)

# Цвета для статусов
STATUS_COLORS = {
    "NEW": "FF6B6B",        # Красный
    "IN_PROGRESS": "FFB347", # Оранжевый
    "DONE": "77DD77",       # Зелёный
    "CANCELLED": "C0C0C0",  # Серый
}

# Цвета для приоритетов
PRIORITY_COLORS = {
    "PLANNED": "77DD77",    # Зелёный
    "1": "77DD77",
    "CURRENT": "87CEEB",    # Голубой
    "2": "87CEEB",
    "URGENT": "FFB347",     # Оранжевый
    "3": "FFB347",
    "EMERGENCY": "FF6B6B",  # Красный
    "4": "FF6B6B",
}

STATUS_LABELS = {
    "NEW": "Новая",
    "IN_PROGRESS": "В работе",
    "DONE": "Выполнена",
    "CANCELLED": "Отменена",
}

PRIORITY_LABELS = {
    "PLANNED": "Плановая", "1": "Плановая",
    "CURRENT": "Текущая", "2": "Текущая",
    "URGENT": "Срочная", "3": "Срочная",
    "EMERGENCY": "Аварийная", "4": "Аварийная",
}


def export_tasks_to_excel(
    db: Session,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    tenant_user: Optional[UserModel] = None,
) -> io.BytesIO:
    """
    Экспорт заявок в Excel файл.
    
    Args:
        db: Сессия SQLAlchemy
        status: Фильтр по статусу
        priority: Фильтр по приоритету
        assignee_id: Фильтр по исполнителю
        date_from: Дата начала (ISO format)
        date_to: Дата окончания (ISO format)
    
    Returns:
        io.BytesIO с содержимым xlsx файла
    """
    # Загружаем заявки
    tenant = TenantFilter(tenant_user) if tenant_user is not None else None
    query = db.query(TaskModel).options(
        joinedload(TaskModel.assigned_user)
    )
    if tenant is not None:
        query = tenant.apply(query, TaskModel)
    
    if status:
        query = query.filter(TaskModel.status == status)
    
    if priority:
        query = query.filter(TaskModel.priority.in_([priority, priority.upper()]))
    
    if assignee_id:
        query = query.filter(TaskModel.assigned_user_id == assignee_id)
    
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            query = query.filter(TaskModel.created_at >= dt_from)
        except ValueError:
            pass
    
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            query = query.filter(TaskModel.created_at <= dt_to)
        except ValueError:
            pass
    
    tasks = query.order_by(TaskModel.created_at.desc()).all()
    
    # Создаём workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Заявки"
    
    # === Стили ===
    header_font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
    header_fill = PatternFill(start_color="2C3E50", end_color="2C3E50", fill_type="solid")
    header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    
    cell_font = Font(name="Calibri", size=10)
    cell_alignment = Alignment(vertical="center", wrap_text=True)
    
    thin_border = Border(
        left=Side(style="thin", color="D0D0D0"),
        right=Side(style="thin", color="D0D0D0"),
        top=Side(style="thin", color="D0D0D0"),
        bottom=Side(style="thin", color="D0D0D0"),
    )
    
    # === Заголовки ===
    headers = [
        ("№", 8),
        ("Номер заявки", 15),
        ("Название", 35),
        ("Статус", 14),
        ("Приоритет", 14),
        ("Адрес", 40),
        ("Исполнитель", 20),
        ("Заказчик", 20),
        ("Телефон", 16),
        ("Создана", 18),
        ("Дата план.", 18),
        ("Завершена", 18),
        ("Время выполн. (ч)", 18),
        ("Сумма", 12),
        ("Описание", 50),
    ]
    
    for col_idx, (header_text, width) in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=header_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border
        ws.column_dimensions[get_column_letter(col_idx)].width = width
    
    # Зафиксировать шапку
    ws.freeze_panes = "A2"
    
    # === Данные ===
    for row_idx, task in enumerate(tasks, 2):
        # №
        ws.cell(row=row_idx, column=1, value=row_idx - 1).font = cell_font
        
        # Номер заявки
        ws.cell(row=row_idx, column=2, value=task.task_number or "").font = cell_font
        
        # Название
        ws.cell(row=row_idx, column=3, value=task.title or "").font = cell_font
        
        # Статус
        status_cell = ws.cell(
            row=row_idx, column=4,
            value=STATUS_LABELS.get(task.status, task.status)
        )
        status_cell.font = Font(name="Calibri", size=10, bold=True)
        status_color = STATUS_COLORS.get(task.status)
        if status_color:
            status_cell.fill = PatternFill(start_color=status_color, end_color=status_color, fill_type="solid")
        status_cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Приоритет
        priority_str = str(task.priority) if task.priority else ""
        priority_cell = ws.cell(
            row=row_idx, column=5,
            value=PRIORITY_LABELS.get(priority_str.upper(), priority_str)
        )
        priority_cell.font = Font(name="Calibri", size=10, bold=True)
        priority_color = PRIORITY_COLORS.get(priority_str.upper())
        if priority_color:
            priority_cell.fill = PatternFill(start_color=priority_color, end_color=priority_color, fill_type="solid")
        priority_cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Адрес
        ws.cell(row=row_idx, column=6, value=task.raw_address or "").font = cell_font
        
        # Исполнитель
        assignee_name = ""
        if task.assigned_user:
            assignee_name = task.assigned_user.full_name or task.assigned_user.username
        ws.cell(row=row_idx, column=7, value=assignee_name).font = cell_font
        
        # Заказчик
        ws.cell(row=row_idx, column=8, value=task.customer_name or "").font = cell_font
        
        # Телефон
        ws.cell(row=row_idx, column=9, value=task.customer_phone or "").font = cell_font
        
        # Создана
        created_str = task.created_at.strftime("%d.%m.%Y %H:%M") if task.created_at else ""
        ws.cell(row=row_idx, column=10, value=created_str).font = cell_font
        
        # Дата план.
        planned_str = ""
        if task.planned_date:
            if isinstance(task.planned_date, datetime):
                planned_str = task.planned_date.strftime("%d.%m.%Y")
            else:
                planned_str = str(task.planned_date)
        ws.cell(row=row_idx, column=11, value=planned_str).font = cell_font
        
        # Завершена
        completed_str = task.completed_at.strftime("%d.%m.%Y %H:%M") if task.completed_at else ""
        ws.cell(row=row_idx, column=12, value=completed_str).font = cell_font
        
        # Время выполнения
        completion_hours = ""
        if task.created_at and task.completed_at:
            hours = (task.completed_at - task.created_at).total_seconds() / 3600
            completion_hours = round(hours, 1)
        ws.cell(row=row_idx, column=13, value=completion_hours).font = cell_font
        
        # Сумма
        amount = getattr(task, "payment_amount", None) or ""
        ws.cell(row=row_idx, column=14, value=amount).font = cell_font
        
        # Описание
        ws.cell(row=row_idx, column=15, value=task.description or "").font = cell_font
        
        # Общие стили для строки
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = thin_border
            if not cell.alignment or cell.alignment.horizontal is None:
                cell.alignment = cell_alignment
        
        # Зебра
        if row_idx % 2 == 0:
            zebra_fill = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                # Не перезаписываем цвет статуса/приоритета
                if col_idx not in (4, 5) or not cell.fill or cell.fill.start_color.rgb == "00000000":
                    cell.fill = zebra_fill
    
    # === Лист сводки ===
    ws_summary = wb.create_sheet("Сводка")
    _add_summary_sheet(ws_summary, tasks, header_font, header_fill, header_alignment, cell_font, thin_border)
    
    # Сохраняем в BytesIO
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    logger.info("Excel export: %d tasks exported", len(tasks))
    return output


def _add_summary_sheet(ws, tasks, header_font, header_fill, header_alignment, cell_font, thin_border):
    """Добавить сводочный лист с агрегированными данными."""
    # Заголовок
    ws.cell(row=1, column=1, value="Сводка по заявкам").font = Font(name="Calibri", bold=True, size=14)
    ws.cell(row=2, column=1, value=f"Дата формирования: {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M UTC')}").font = cell_font
    ws.cell(row=3, column=1, value=f"Всего заявок: {len(tasks)}").font = cell_font
    
    # По статусам
    row = 5
    ws.cell(row=row, column=1, value="По статусам").font = Font(name="Calibri", bold=True, size=12)
    row += 1
    
    for header_col, header_text in enumerate(["Статус", "Количество", "%"], 1):
        cell = ws.cell(row=row, column=header_col, value=header_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border
    
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 15
    ws.column_dimensions["C"].width = 10
    
    row += 1
    for status_key, status_label in STATUS_LABELS.items():
        count = sum(1 for t in tasks if t.status == status_key)
        pct = round(count / len(tasks) * 100, 1) if tasks else 0
        ws.cell(row=row, column=1, value=status_label).font = cell_font
        ws.cell(row=row, column=2, value=count).font = cell_font
        ws.cell(row=row, column=3, value=f"{pct}%").font = cell_font
        for c in range(1, 4):
            ws.cell(row=row, column=c).border = thin_border
        row += 1
    
    # По приоритетам
    row += 1
    ws.cell(row=row, column=1, value="По приоритетам").font = Font(name="Calibri", bold=True, size=12)
    row += 1
    
    for header_col, header_text in enumerate(["Приоритет", "Количество", "%"], 1):
        cell = ws.cell(row=row, column=header_col, value=header_text)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment
        cell.border = thin_border
    
    row += 1
    for priority_key in ["PLANNED", "CURRENT", "URGENT", "EMERGENCY"]:
        rank = {"PLANNED": "1", "CURRENT": "2", "URGENT": "3", "EMERGENCY": "4"}[priority_key]
        count = sum(1 for t in tasks if str(t.priority).upper() in (priority_key, rank))
        pct = round(count / len(tasks) * 100, 1) if tasks else 0
        ws.cell(row=row, column=1, value=PRIORITY_LABELS.get(priority_key, priority_key)).font = cell_font
        ws.cell(row=row, column=2, value=count).font = cell_font
        ws.cell(row=row, column=3, value=f"{pct}%").font = cell_font
        for c in range(1, 4):
            ws.cell(row=row, column=c).border = thin_border
        row += 1
