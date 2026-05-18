from datetime import date

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import extract, select

from app.core.deps import CurrentUser, DB, TenantID
from app.models.transaction import Category, Transaction, TransactionType
from app.schemas.transaction import TransactionCreate, TransactionRead, TransactionUpdate
from app.services.audit import client_ip, log as audit

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionRead])
async def list_transactions(
    db: DB,
    tenant_id: TenantID,
    month: int | None = Query(None, ge=1, le=12),
    year: int | None = Query(None, ge=2000, le=2100),
    type: TransactionType | None = None,
    category_id: int | None = None,
):
    q = select(Transaction).where(Transaction.tenant_id == tenant_id)
    if month is not None:
        q = q.where(extract("month", Transaction.date) == month)
    if year is not None:
        q = q.where(extract("year", Transaction.date) == year)
    if type is not None:
        q = q.where(Transaction.type == type)
    if category_id is not None:
        q = q.where(Transaction.category_id == category_id)
    q = q.order_by(Transaction.date.desc(), Transaction.id.desc())
    result = await db.scalars(q)
    return result.all()


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    request: Request, body: TransactionCreate, db: DB, tenant_id: TenantID, current_user: CurrentUser
):
    await _assert_category_belongs(db, body.category_id, tenant_id)
    transaction = Transaction(**body.model_dump(), tenant_id=tenant_id, created_by=current_user.id)
    db.add(transaction)
    await db.flush()
    await audit(db, "transaction.create", user_id=current_user.id, tenant_id=tenant_id,
                entity="transaction", entity_id=transaction.id,
                payload={"type": body.type, "amount": str(body.amount), "date": str(body.date)},
                ip=client_ip(request))
    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.get("/{transaction_id}", response_model=TransactionRead)
async def get_transaction(transaction_id: int, db: DB, tenant_id: TenantID):
    return await _get_or_404(db, transaction_id, tenant_id)


@router.put("/{transaction_id}", response_model=TransactionRead)
async def update_transaction(
    request: Request, transaction_id: int, body: TransactionUpdate, db: DB,
    tenant_id: TenantID, current_user: CurrentUser
):
    transaction = await _get_or_404(db, transaction_id, tenant_id)
    data = body.model_dump(exclude_none=True)
    if "category_id" in data:
        await _assert_category_belongs(db, data["category_id"], tenant_id)
    for field, value in data.items():
        setattr(transaction, field, value)
    await audit(db, "transaction.update", user_id=current_user.id, tenant_id=tenant_id,
                entity="transaction", entity_id=transaction_id,
                payload={k: str(v) for k, v in data.items()}, ip=client_ip(request))
    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    request: Request, transaction_id: int, db: DB, tenant_id: TenantID, current_user: CurrentUser
):
    transaction = await _get_or_404(db, transaction_id, tenant_id)
    await audit(db, "transaction.delete", user_id=current_user.id, tenant_id=tenant_id,
                entity="transaction", entity_id=transaction_id,
                payload={"amount": str(transaction.amount), "type": transaction.type.value},
                ip=client_ip(request))
    await db.delete(transaction)
    await db.commit()


async def _get_or_404(db, transaction_id: int, tenant_id: int) -> Transaction:
    transaction = await db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.tenant_id == tenant_id
        )
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


async def _assert_category_belongs(db, category_id: int, tenant_id: int) -> None:
    category = await db.scalar(
        select(Category).where(Category.id == category_id, Category.tenant_id == tenant_id)
    )
    if not category:
        raise HTTPException(
            status_code=422, detail="Category not found or does not belong to this tenant"
        )
