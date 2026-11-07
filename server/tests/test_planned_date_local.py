"""Плановая дата — наивное местное время, её нельзя сдвигать как UTC.

Портал шлёт значение из <input type="datetime-local">, Android — дату из
DatePicker; оба без пояса. Ошибка была в том, что часть кода прибавляла к ней
три часа, и визит на 22:00 показывался заявителю следующим днём.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

from app.api.public_tasks import PublicTaskView
from app.schemas.task import PlannedDateUpdate, TaskCreate
from app.services import applicant_notify
from app.services.business_time import to_naive_local
from app.services.task_service import _planned_day


def test_naive_input_is_kept_as_entered():
    data = PlannedDateUpdate(planned_date="2026-11-07T22:00")
    assert data.planned_date == datetime(2026, 11, 7, 22, 0)


def test_date_only_input_is_local_midnight():
    data = PlannedDateUpdate(planned_date="2026-11-07")
    assert data.planned_date == datetime(2026, 11, 7)


def test_aware_input_is_converted_to_local_wall_time():
    # 21:30 UTC = 00:30 следующего дня по Москве
    data = TaskCreate(
        title="Лифт", address="ул. Ленина, 1", planned_date="2026-11-07T21:30:00Z"
    )
    assert data.planned_date == datetime(2026, 11, 8, 0, 30)
    assert data.planned_date.tzinfo is None


def test_to_naive_local_passes_naive_through():
    moment = datetime(2026, 11, 7, 23, 59)
    assert to_naive_local(moment) is moment
    aware = datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)
    assert to_naive_local(aware) == datetime(2026, 11, 7, 15, 0)


def test_late_evening_visit_stays_on_its_day():
    assert _planned_day(datetime(2026, 11, 7, 22, 0)).isoformat() == "2026-11-07"


def test_applicant_message_uses_entered_day():
    task = SimpleNamespace(
        planned_date=datetime(2026, 11, 7, 22, 0), task_number="Z-00042", id=42
    )
    text = applicant_notify._text(task, "planned")
    assert text == "Заявка Z-00042: мастер приедет 07.11.2026."


def test_public_view_serializes_planned_date_without_utc_marker():
    view = PublicTaskView(
        number="Z-00042",
        title="Лифт",
        address="ул. Ленина, 1",
        status="NEW",
        status_label="Новая",
        planned_date=datetime(2026, 11, 7, 22, 0),
        events=[],
        acts=[],
    )
    assert view.model_dump(mode="json")["planned_date"] == "2026-11-07T22:00:00"
