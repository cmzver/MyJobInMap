"""
Counterparties API
==================
Контрагенты (УК/ТСЖ): реквизиты, привязка объектов и сводный акт за месяц.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.acts import act_to_response
from app.models import (
    ActModel,
    AddressModel,
    AddressSystemModel,
    ClientAccountModel,
    CounterpartyModel,
    UserModel,
    get_db,
)
from app.schemas.act import ActResponse
from app.schemas.client import (
    ClientAccountCreate,
    ClientAccountResponse,
    ClientAccountUpdate,
)
from app.schemas.counterparty import (
    MONTH_PATTERN,
    CounterpartyAddress,
    CounterpartyAddressesUpdate,
    CounterpartyCreate,
    CounterpartyResponse,
    CounterpartyUpdate,
    SummaryActCreate,
    SummaryLine,
    SummaryPreview,
    SummaryVisit,
)
from app.services import require_permission
from app.services.act_service import ActServiceError
from app.services.client_cabinet import normalize_login, set_password
from app.services.summary_act_service import (
    BILLABLE_SYSTEM_STATUSES,
    SUMMARY,
    existing_summary_act,
    issue_summary_act,
    summary_content,
)

router = APIRouter(prefix="/api/counterparties", tags=["Counterparties"])


def _organization_id(user: UserModel) -> int:
    if user.organization_id is None:
        raise HTTPException(
            status_code=400, detail="Контрагенты ведутся внутри организации"
        )
    return user.organization_id


def _get(db: Session, counterparty_id: int, user: UserModel) -> CounterpartyModel:
    counterparty = (
        db.query(CounterpartyModel)
        .filter(
            CounterpartyModel.id == counterparty_id,
            CounterpartyModel.organization_id == _organization_id(user),
        )
        .first()
    )
    if counterparty is None:
        raise HTTPException(status_code=404, detail="Контрагент не найден")
    return counterparty


def _responses(
    db: Session, counterparties: List[CounterpartyModel]
) -> List[CounterpartyResponse]:
    ids = [counterparty.id for counterparty in counterparties]
    counts = dict(
        db.query(AddressModel.counterparty_id, func.count(AddressModel.id))
        .filter(AddressModel.counterparty_id.in_(ids))
        .group_by(AddressModel.counterparty_id)
        .all()
    )
    totals = dict(
        db.query(
            AddressModel.counterparty_id, func.sum(AddressSystemModel.monthly_cost)
        )
        .join(AddressSystemModel, AddressSystemModel.address_id == AddressModel.id)
        .filter(
            AddressModel.counterparty_id.in_(ids),
            AddressSystemModel.status.in_(BILLABLE_SYSTEM_STATUSES),
        )
        .group_by(AddressModel.counterparty_id)
        .all()
    )
    return [
        CounterpartyResponse.model_validate(counterparty).model_copy(
            update={
                "address_count": counts.get(counterparty.id, 0),
                "monthly_total": float(totals.get(counterparty.id) or 0),
            }
        )
        for counterparty in counterparties
    ]


def _error(exc: ActServiceError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("", response_model=List[CounterpartyResponse])
def list_counterparties(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    query = db.query(CounterpartyModel).filter(
        CounterpartyModel.organization_id == _organization_id(user)
    )
    if not include_inactive:
        query = query.filter(CounterpartyModel.is_active.is_(True))
    return _responses(db, query.order_by(CounterpartyModel.name).all())


@router.post("", response_model=CounterpartyResponse, status_code=201)
def create_counterparty(
    data: CounterpartyCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    counterparty = CounterpartyModel(
        organization_id=_organization_id(user), **data.model_dump()
    )
    db.add(counterparty)
    db.commit()
    db.refresh(counterparty)
    return _responses(db, [counterparty])[0]


@router.get("/{counterparty_id}", response_model=CounterpartyResponse)
def get_counterparty(
    counterparty_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    return _responses(db, [_get(db, counterparty_id, user)])[0]


@router.patch("/{counterparty_id}", response_model=CounterpartyResponse)
def update_counterparty(
    counterparty_id: int,
    data: CounterpartyUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    counterparty = _get(db, counterparty_id, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(counterparty, field, value)
    db.commit()
    db.refresh(counterparty)
    return _responses(db, [counterparty])[0]


@router.delete("/{counterparty_id}", status_code=204)
def delete_counterparty(
    counterparty_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    """Удалить можно только без выпущенных сводных актов — иначе в архив."""
    counterparty = _get(db, counterparty_id, user)
    has_acts = (
        db.query(ActModel.id)
        .filter(ActModel.counterparty_id == counterparty.id)
        .first()
        is not None
    )
    if has_acts:
        raise HTTPException(
            status_code=409,
            detail="По контрагенту выпущены акты — отключите его вместо удаления",
        )
    db.query(AddressModel).filter(
        AddressModel.counterparty_id == counterparty.id
    ).update({AddressModel.counterparty_id: None}, synchronize_session=False)
    db.delete(counterparty)
    db.commit()


@router.get("/{counterparty_id}/addresses", response_model=List[CounterpartyAddress])
def counterparty_addresses(
    counterparty_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    counterparty = _get(db, counterparty_id, user)
    rows = (
        db.query(
            AddressModel, func.coalesce(func.sum(AddressSystemModel.monthly_cost), 0)
        )
        .outerjoin(
            AddressSystemModel,
            (AddressSystemModel.address_id == AddressModel.id)
            & AddressSystemModel.status.in_(BILLABLE_SYSTEM_STATUSES),
        )
        .filter(AddressModel.counterparty_id == counterparty.id)
        .group_by(AddressModel.id)
        .order_by(AddressModel.address)
        .all()
    )
    return [
        CounterpartyAddress(
            id=address.id, address=address.address, monthly_cost=float(cost)
        )
        for address, cost in rows
    ]


@router.put("/{counterparty_id}/addresses", response_model=List[CounterpartyAddress])
def set_counterparty_addresses(
    counterparty_id: int,
    data: CounterpartyAddressesUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    """Полный список объектов контрагента. Объект может принадлежать одному
    контрагенту: привязка к этому снимает его с прежнего."""
    counterparty = _get(db, counterparty_id, user)
    wanted = set(data.address_ids)
    if wanted:
        own = {
            address_id
            for (address_id,) in db.query(AddressModel.id).filter(
                AddressModel.id.in_(wanted),
                AddressModel.organization_id == counterparty.organization_id,
            )
        }
        if own != wanted:
            raise HTTPException(status_code=400, detail="Объект не найден")
    db.query(AddressModel).filter(
        AddressModel.counterparty_id == counterparty.id,
        AddressModel.id.notin_(wanted) if wanted else true(),
    ).update({AddressModel.counterparty_id: None}, synchronize_session=False)
    if wanted:
        db.query(AddressModel).filter(AddressModel.id.in_(wanted)).update(
            {
                AddressModel.counterparty_id: counterparty.id,
                # Строка «УК» в карточке объекта — по контрагенту
                AddressModel.management_company: counterparty.name,
            },
            synchronize_session=False,
        )
    db.commit()
    return counterparty_addresses(counterparty_id, db, user)


@router.get("/{counterparty_id}/summary-preview", response_model=SummaryPreview)
def summary_preview(
    counterparty_id: int,
    month: str = Query(..., pattern=MONTH_PATTERN),
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    """Что попадёт в сводный акт за месяц — до выпуска."""
    counterparty = _get(db, counterparty_id, user)
    built = summary_content(db, counterparty, month)
    existing = existing_summary_act(db, counterparty, month)
    return SummaryPreview(
        month=month,
        period_label=built["period_label"],
        lines=[
            SummaryLine(
                position=line["position"],
                kind=line["kind"],
                name=line["name"],
                details=line["details"] or None,
                amount=float(line["amount"]),
            )
            for line in built["lines"]
        ],
        visits=[SummaryVisit(**visit) for visit in built["visits"]],
        subscription_total=float(built["subscription_total"]),
        acts_total=float(built["acts_total"]),
        total=float(built["total"]),
        existing_act_id=existing.id if existing else None,
        existing_act_number=existing.number if existing else None,
    )


@router.post(
    "/{counterparty_id}/summary-acts", response_model=ActResponse, status_code=201
)
def create_summary_act(
    counterparty_id: int,
    data: SummaryActCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    counterparty = _get(db, counterparty_id, user)
    try:
        act = issue_summary_act(
            db, counterparty, data.month, user, data.supersedes_act_id
        )
    except ActServiceError as exc:
        db.rollback()  # номер акта, взятый под блокировкой, не расходуем
        raise _error(exc)
    return act_to_response(act)


@router.get("/{counterparty_id}/summary-acts", response_model=List[ActResponse])
def list_summary_acts(
    counterparty_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("view_acts")),
):
    counterparty = _get(db, counterparty_id, user)
    acts = (
        db.query(ActModel)
        .options(selectinload(ActModel.lines))
        .filter(ActModel.kind == SUMMARY, ActModel.counterparty_id == counterparty.id)
        .order_by(ActModel.period_start.desc(), ActModel.id.desc())
        .all()
    )
    return [act_to_response(act) for act in acts]


# ------------------------------------------------------- вход в кабинет клиента


def _account(
    db: Session, counterparty: CounterpartyModel, account_id: int
) -> ClientAccountModel:
    account = (
        db.query(ClientAccountModel)
        .filter(
            ClientAccountModel.id == account_id,
            ClientAccountModel.counterparty_id == counterparty.id,
        )
        .first()
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Вход не найден")
    return account


@router.get("/{counterparty_id}/accounts", response_model=List[ClientAccountResponse])
def list_client_accounts(
    counterparty_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    counterparty = _get(db, counterparty_id, user)
    return (
        db.query(ClientAccountModel)
        .filter(ClientAccountModel.counterparty_id == counterparty.id)
        .order_by(ClientAccountModel.full_name)
        .all()
    )


@router.post(
    "/{counterparty_id}/accounts",
    response_model=ClientAccountResponse,
    status_code=201,
)
def create_client_account(
    counterparty_id: int,
    data: ClientAccountCreate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    """Вход в кабинет клиента для представителя контрагента."""
    counterparty = _get(db, counterparty_id, user)
    login = normalize_login(data.login)
    if db.query(ClientAccountModel.id).filter_by(login=login).first() is not None:
        raise HTTPException(status_code=409, detail="Такой логин уже занят")
    account = ClientAccountModel(
        organization_id=counterparty.organization_id,
        counterparty_id=counterparty.id,
        login=login,
        password_hash="",
        full_name=data.full_name.strip(),
        position=(data.position or "").strip() or None,
        phone=(data.phone or "").strip() or None,
        email=(data.email or "").strip() or None,
    )
    set_password(account, data.password)
    db.add(account)
    try:
        db.commit()
    except IntegrityError:
        # Тот же логин заняли параллельно — между проверкой и записью
        db.rollback()
        raise HTTPException(status_code=409, detail="Такой логин уже занят")
    db.refresh(account)
    return account


@router.patch(
    "/{counterparty_id}/accounts/{account_id}",
    response_model=ClientAccountResponse,
)
def update_client_account(
    counterparty_id: int,
    account_id: int,
    data: ClientAccountUpdate,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    """Изменить, отключить или сбросить пароль — выданные токены гаснут."""
    account = _account(db, _get(db, counterparty_id, user), account_id)
    changes = data.model_dump(exclude_unset=True)
    password = changes.pop("password", None)
    if password:
        set_password(account, password)
    if changes.get("is_active") is False and account.is_active:
        account.auth_version += 1
    for field, value in changes.items():
        if field in {"full_name", "is_active"} and value is None:
            continue
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/{counterparty_id}/accounts/{account_id}", status_code=204)
def delete_client_account(
    counterparty_id: int,
    account_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(require_permission("manage_acts")),
):
    """Удалить вход; поданные им заявки остаются (без ссылки на вход)."""
    db.delete(_account(db, _get(db, counterparty_id, user), account_id))
    db.commit()
