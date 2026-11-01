"""
Repeat Detector
===============
Повторные заявки на одном месте (адрес + система):

- возврат (return) — заявку на этом месте закрыли не раньше чем за
  repeat_window_days до создания; определяется автоматически. Возвраты —
  метрика качества ремонта;
- дубль (duplicate) — отмечает диспетчер (mark_duplicate), выбирая исходную
  заявку. Автоматически дубли не ищутся: открытая заявка в том же доме часто
  про другую квартиру или другую поломку.

Возврат считается относительно момента создания заявки, поэтому тот же
расчёт годится и для новой заявки, и для правки адреса, и для бэкфилла
истории в миграции. Функции разбора работают с любыми объектами с полями
заявки — моделью или строкой выборки.
"""

from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session, joinedload

from app.models import OrganizationSettingsModel, TaskModel
from app.models.base import utcnow
from app.models.enums import TaskStatus
from app.services.address_parser import (
    building_key,
    city_key,
    corpus_key,
    parse_address,
    street_key,
)
from app.services.business_time import to_naive_utc

DUPLICATE = "duplicate"
RETURN = "return"
DEFAULT_REPEAT_WINDOW_DAYS = 30

_OPEN_STATUSES = (TaskStatus.NEW.value, TaskStatus.IN_PROGRESS.value)
_DONE = TaskStatus.DONE.value
_CANCELLED = TaskStatus.CANCELLED.value


def address_key(raw_address: Optional[str]) -> Optional[str]:
    """«Улица|дом» для поиска повторов: «ул. Невская, д. 9» и «Невская 9» — одно.

    Город и корпус в ключ не входят — у части адресов их нет; их расхождение
    проверяет _same_place.
    """
    parsed = parse_address(raw_address or "")
    street = street_key(parsed.street)
    building = building_key(parsed.building)
    if not street or not building:
        return None
    return f"{' '.join(sorted(street))}|{building}"[:160]


@lru_cache(maxsize=4096)
def _place_parts(raw_address: str) -> Tuple[str, str]:
    parsed = parse_address(raw_address)
    return city_key(parsed.city), corpus_key(parsed.corpus)


def _conflict(left: str, right: str) -> bool:
    return bool(left and right and left != right)


def _same_place(task: Any, other: Any) -> bool:
    if task.address_id and other.address_id:
        return task.address_id == other.address_id
    if not task.address_key or task.address_key != other.address_key:
        return False
    city, corpus = _place_parts(task.raw_address or "")
    other_city, other_corpus = _place_parts(other.raw_address or "")
    return not _conflict(city, other_city) and not _conflict(corpus, other_corpus)


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _systems_compatible(task: Any, other: Any) -> bool:
    """Система одна и та же — либо у одной из заявок она не указана."""
    if task.system_id and other.system_id:
        return task.system_id == other.system_id
    return not _conflict(_norm(task.system_type), _norm(other.system_type))


def same_defect(task: Any, other: Any) -> bool:
    """Та же неисправность — «сильный» повтор."""
    return bool(_norm(task.defect_type)) and _norm(task.defect_type) == _norm(
        other.defect_type
    )


def _repeat_kind(task: Any, other: Any, window: timedelta) -> Optional[str]:
    """Чем other была для task в момент её создания."""
    if other.status == _CANCELLED or other.created_at is None:
        return None
    at = to_naive_utc(task.created_at)
    created = to_naive_utc(other.created_at)
    # Повтор — только более ранней заявки; при равном времени решает id.
    if created > at or (
        created == at
        and task.id is not None
        and other.id is not None
        and other.id > task.id
    ):
        return None
    if other.status in _OPEN_STATUSES:
        return DUPLICATE
    if other.status != _DONE or other.completed_at is None:
        return None
    completed = to_naive_utc(other.completed_at)
    if completed > at:
        return DUPLICATE
    if completed >= at - window:
        return RETURN
    return None


def pick_repeat(
    task: Any, candidates: Iterable[Any], window_days: int
) -> Optional[Tuple[Any, str]]:
    """Возврат: более ранняя заявка на том же месте, закрытая за окно до
    создания этой. Сначала — с той же неисправностью, затем закрытая последней."""
    if task.created_at is None:
        return None
    window = timedelta(days=window_days)
    returns = [
        other
        for other in candidates
        if other.id != task.id
        and _same_place(task, other)
        and _systems_compatible(task, other)
        and _repeat_kind(task, other, window) == RETURN
    ]
    if not returns:
        return None
    best = max(
        returns,
        key=lambda o: (same_defect(task, o), to_naive_utc(o.completed_at)),
    )
    return best, RETURN


def get_repeat_window_days(db: Session, organization_id: Optional[int]) -> int:
    if organization_id is None:
        return DEFAULT_REPEAT_WINDOW_DAYS
    row = db.get(OrganizationSettingsModel, organization_id)
    if row is None or not row.repeat_window_days:
        return DEFAULT_REPEAT_WINDOW_DAYS
    return row.repeat_window_days


def place_query(
    db: Session,
    organization_id: Optional[int],
    address_id: Optional[int],
    key: Optional[str],
) -> Optional[Query]:
    """Заявки организации, которые могут быть на том же месте (без проверки
    города/корпуса и системы — их делает pick_repeat/_same_place)."""
    conditions = []
    if address_id is not None:
        conditions.append(TaskModel.address_id == address_id)
    if key:
        conditions.append(TaskModel.address_key == key)
    if not conditions:
        return None
    query = db.query(TaskModel).filter(or_(*conditions))
    if organization_id is None:
        return query.filter(TaskModel.organization_id.is_(None))
    return query.filter(TaskModel.organization_id == organization_id)


def find_repeat(
    db: Session, task: TaskModel, window_days: Optional[int] = None
) -> Optional[Tuple[TaskModel, str]]:
    if window_days is None:
        window_days = get_repeat_window_days(db, task.organization_id)
    query = place_query(db, task.organization_id, task.address_id, task.address_key)
    if query is None or task.created_at is None:
        return None
    at = to_naive_utc(task.created_at)
    query = query.filter(
        TaskModel.status == _DONE,
        TaskModel.created_at <= at,
        TaskModel.completed_at >= at - timedelta(days=window_days),
        TaskModel.completed_at <= at,
    )
    if task.id is not None:
        query = query.filter(TaskModel.id != task.id)
    return pick_repeat(task, query.all(), window_days)


def apply_repeat(db: Session, task: TaskModel) -> None:
    """Проставить место заявки и возврат. Вызывать после того, как заполнены
    адрес, address_id, система и организация, до добавления новой заявки
    в сессию (иначе автосброс сессии зацепит её саму). Отметку дубля,
    поставленную вручную, не трогает."""
    if task.created_at is None:
        task.created_at = to_naive_utc(utcnow())
    task.address_key = address_key(task.raw_address)
    if task.repeat_kind == DUPLICATE:
        return
    match = find_repeat(db, task)
    if match is None:
        task.repeat_of = None
        task.repeat_kind = None
    else:
        task.repeat_of, task.repeat_kind = match


class RepeatMarkError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def mark_duplicate(db: Session, task: TaskModel, original: Optional[TaskModel]) -> None:
    """Отметить заявку дублем original (той же организации) или снять отметку
    (original=None) — тогда заявка снова может оказаться возвратом.

    Цепочек не бывает: дубль дубля указывает на исходную, а дубли самой
    заявки переезжают на её исходную."""
    if original is None:
        if task.repeat_kind == DUPLICATE:
            task.repeat_of = None
            task.repeat_kind = None
            apply_repeat(db, task)
        return
    if original.repeat_kind == DUPLICATE and original.repeat_of is not None:
        original = original.repeat_of
    if original.id == task.id:
        raise RepeatMarkError("Заявка не может быть дублем самой себя")
    task.repeat_of = original
    task.repeat_kind = DUPLICATE
    db.query(TaskModel).filter(
        TaskModel.repeat_of_task_id == task.id,
        TaskModel.repeat_kind == DUPLICATE,
    ).update({TaskModel.repeat_of_task_id: original.id}, synchronize_session=False)


def find_related(
    db: Session,
    probe: Any,
    organization_id: Optional[int],
    *,
    assigned_user_id: Optional[int] = None,
    now: Optional[datetime] = None,
    history_limit: int = 5,
) -> Dict[str, Any]:
    """Заявки на месте probe (заявки или черновика) на текущий момент:
    открытые, закрытые за окно повторов и последние по месту.

    assigned_user_id — показывать только заявки этого исполнителя (мастер
    видит лишь свои, как в списке заявок).
    """
    window_days = get_repeat_window_days(db, organization_id)
    result: Dict[str, Any] = {
        "open_tasks": [],
        "recently_closed": [],
        "history": [],
        "window_days": window_days,
    }
    query = place_query(db, organization_id, probe.address_id, probe.address_key)
    if query is None:
        return result
    if probe.id is not None:
        query = query.filter(TaskModel.id != probe.id)
    if assigned_user_id is not None:
        query = query.filter(TaskModel.assigned_user_id == assigned_user_id)
    rows = (
        query.options(joinedload(TaskModel.assigned_user))
        .order_by(TaskModel.created_at.desc(), TaskModel.id.desc())
        .limit(200)
        .all()
    )
    tasks = [
        task
        for task in rows
        if _same_place(probe, task) and _systems_compatible(probe, task)
    ]
    since = to_naive_utc(now or utcnow()) - timedelta(days=window_days)
    result["open_tasks"] = [t for t in tasks if t.status in _OPEN_STATUSES]
    result["recently_closed"] = [
        t
        for t in tasks
        if t.status == _DONE
        and t.completed_at is not None
        and to_naive_utc(t.completed_at) >= since
    ]
    result["history"] = tasks[:history_limit]
    return result
