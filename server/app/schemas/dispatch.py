"""Серверная сводка диспетчера по полному результату фильтрации."""

from typing import Dict, List, Optional

from pydantic import BaseModel


class DispatchRow(BaseModel):
    key: str
    assigneeId: Optional[int]
    assigneeName: str
    counts: Dict[str, int]
    active: int
    urgent: int
    total: int


class DispatchOverview(BaseModel):
    rows: List[DispatchRow]
    total: int
