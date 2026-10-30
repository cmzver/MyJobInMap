"""Идемпотентность клиентских записей по заголовку ``Idempotency-Key``.

Повтор запроса с тем же ключом возвращает сохранённый ответ, не выполняя
операцию заново. Ключ уникален в пределах пользователя и привязан к операции
(``scope``): переиспользование для другой операции — 422.
"""

import json
from datetime import timedelta
from typing import Annotated, Optional

from fastapi import Header, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.idempotency import IdempotencyKeyModel

# Outbox клиента повторяет максимум несколько дней — дольше хранить незачем.
IDEMPOTENCY_TTL = timedelta(days=7)
MAX_KEY_LENGTH = 64

# Параметр эндпоинта: ``idempotency_key: IdempotencyKey = None``.
IdempotencyKey = Annotated[
    Optional[str],
    Header(
        alias="Idempotency-Key",
        max_length=MAX_KEY_LENGTH,
        description="Повтор с тем же ключом вернёт сохранённый ответ (Android-outbox).",
    ),
]


def cached_response(
    db: Session, user_id: int, key: Optional[str], scope: str
) -> Optional[JSONResponse]:
    """Сохранённый ответ для ключа или None, если операция ещё не выполнялась."""
    if not key:
        return None
    row = (
        db.query(IdempotencyKeyModel)
        .filter(IdempotencyKeyModel.user_id == user_id, IdempotencyKeyModel.key == key)
        .first()
    )
    if row is None:
        return None
    if row.scope != scope:
        raise HTTPException(
            status_code=422,
            detail="Idempotency-Key уже использован для другой операции",
        )
    return JSONResponse(
        content=json.loads(row.response_json), status_code=row.status_code
    )


def stage_response(
    db: Session,
    user_id: int,
    key: Optional[str],
    scope: str,
    payload,
    status_code: int = 200,
) -> None:
    """Добавить ответ в текущую транзакцию — закоммитится вместе с операцией."""
    if not key:
        return
    db.add(
        IdempotencyKeyModel(
            user_id=user_id,
            key=key,
            scope=scope,
            status_code=status_code,
            response_json=json.dumps(jsonable_encoder(payload), ensure_ascii=False),
        )
    )


def remember_response(
    db: Session,
    user_id: int,
    key: Optional[str],
    scope: str,
    payload,
    status_code: int = 200,
) -> None:
    """Сохранить ответ после уже закоммиченной операции (сервис коммитит сам)."""
    if not key:
        return
    stage_response(db, user_id, key, scope, payload, status_code)
    try:
        db.commit()
    except IntegrityError:
        # Параллельный повтор с тем же ключом успел сохранить ответ первым.
        db.rollback()
    prune_expired(db)


def prune_expired(db: Session) -> None:
    """Удалить ключи старше TTL (по индексу created_at — дёшево)."""
    db.query(IdempotencyKeyModel).filter(
        IdempotencyKeyModel.created_at < utcnow() - IDEMPOTENCY_TTL
    ).delete(synchronize_session=False)
    db.commit()
