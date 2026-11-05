"""Кабинет клиента: вход представителя контрагента и его область видимости.

Изоляция: токен кабинета — JWT с ``type = "client"``; обычная авторизация
принимает только ``type = "access"``, а эндпоинты кабинета — только
``"client"``. Всё, что видит представитель, ограничено объектами его
контрагента (``addresses.counterparty_id``) в его организации.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import and_, or_
from sqlalchemy.orm import Query, Session

from app.config import settings
from app.models import (
    ActModel,
    AddressModel,
    ClientAccountModel,
    CounterpartyModel,
    OrganizationModel,
    TaskModel,
    get_db,
)
from app.services.auth import get_password_hash, oauth2_scheme, verify_password

TOKEN_TYPE = "client"
TOKEN_TTL = timedelta(hours=12)
# Проверка пароля для несуществующего логина занимает столько же времени
_DUMMY_HASH = get_password_hash("client-cabinet-dummy")


def create_client_token(account: ClientAccountModel) -> str:
    payload = {
        "sub": f"client:{account.id}",
        "client_id": account.id,
        "auth_version": account.auth_version,
        "type": TOKEN_TYPE,
        "exp": datetime.now(timezone.utc) + TOKEN_TTL,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def _usable(db: Session, account: Optional[ClientAccountModel]) -> bool:
    if account is None or not account.is_active:
        return False
    counterparty = db.get(CounterpartyModel, account.counterparty_id)
    organization = db.get(OrganizationModel, account.organization_id)
    return bool(
        counterparty
        and counterparty.is_active
        and counterparty.organization_id == account.organization_id
        and organization
        and organization.is_active
    )


def authenticate(
    db: Session, login: str, password: str
) -> Optional[ClientAccountModel]:
    account = (
        db.query(ClientAccountModel)
        .filter(ClientAccountModel.login == login.strip().lower())
        .first()
    )
    if account is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, account.password_hash):
        return None
    return account if _usable(db, account) else None


def get_current_client(
    token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> ClientAccountModel:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Войдите в кабинет",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise unauthorized
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
    except JWTError:
        raise unauthorized
    if payload.get("type") != TOKEN_TYPE or not isinstance(
        payload.get("client_id"), int
    ):
        raise unauthorized
    account = db.get(ClientAccountModel, payload["client_id"])
    if not _usable(db, account) or payload.get("auth_version") != account.auth_version:
        raise unauthorized
    return account


def set_password(account: ClientAccountModel, password: str) -> None:
    account.password_hash = get_password_hash(password)
    account.auth_version = (account.auth_version or 0) + 1


def normalize_login(login: str) -> str:
    return login.strip().lower()


# ------------------------------------------------------------- видимость


def addresses_query(db: Session, account: ClientAccountModel) -> Query:
    return db.query(AddressModel).filter(
        AddressModel.organization_id == account.organization_id,
        AddressModel.counterparty_id == account.counterparty_id,
    )


def address_ids(db: Session, account: ClientAccountModel) -> List[int]:
    return [
        row.id for row in addresses_query(db, account).with_entities(AddressModel.id)
    ]


def tasks_query(db: Session, account: ClientAccountModel) -> Query:
    """Заявки по объектам контрагента и поданные этим контрагентом."""
    ids = address_ids(db, account)
    accounts = db.query(ClientAccountModel.id).filter(
        ClientAccountModel.counterparty_id == account.counterparty_id
    )
    return db.query(TaskModel).filter(
        TaskModel.organization_id == account.organization_id,
        or_(
            TaskModel.address_id.in_(ids),
            TaskModel.client_account_id.in_(accounts),
        ),
    )


# Акты по заявке, которые подписывает сторона контрагента. Акты жильцов
# (платные работы в квартире) — с их ФИО, телефоном и суммой — кабинету не видны.
ORGANIZATION_SIGNER_ROLES = ("uk_rep", "chairman")


def acts_query(db: Session, account: ClientAccountModel) -> Query:
    """Сводные акты контрагента и акты по его заявкам, где подписант — УК/председатель."""
    task_ids = tasks_query(db, account).with_entities(TaskModel.id)
    return db.query(ActModel).filter(
        ActModel.organization_id == account.organization_id,
        or_(
            ActModel.counterparty_id == account.counterparty_id,
            and_(
                ActModel.task_id.in_(task_ids),
                ActModel.customer_role.in_(ORGANIZATION_SIGNER_ROLES),
            ),
        ),
    )


def own_task(db: Session, account: ClientAccountModel, task_id: int) -> TaskModel:
    task = tasks_query(db, account).filter(TaskModel.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return task


def own_act(
    db: Session, account: ClientAccountModel, act_id: int, for_update: bool = False
) -> ActModel:
    query = acts_query(db, account).filter(ActModel.id == act_id)
    if for_update:
        # Подпись по ссылке и в кабинете одновременно — вторая увидит «подписан»
        query = query.with_for_update()
    act = query.first()
    if act is None:
        raise HTTPException(status_code=404, detail="Акт не найден")
    return act
