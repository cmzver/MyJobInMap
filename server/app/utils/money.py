"""Денежные значения: ``Decimal`` с копейками и округлением половины вверх."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Union

CENTS = Decimal("0.01")

Number = Union[Decimal, float, int, str]


def money(value: Number) -> Decimal:
    """Сумма с точностью до копейки; ``float`` идёт через ``str`` без хвостов."""
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def to_money(value: Optional[Number]) -> Optional[Decimal]:
    return None if value is None else money(value)
