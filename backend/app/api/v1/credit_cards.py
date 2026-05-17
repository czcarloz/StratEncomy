from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DB, TenantID
from app.models.credit_card import CreditCard, CreditCardPurchase
from app.schemas.credit_card import (
    CreditCardCreate,
    CreditCardOut,
    CreditCardUpdate,
    InvoiceItem,
    InvoiceOut,
    PurchaseCreate,
    PurchaseOut,
)

router = APIRouter(prefix="/credit-cards", tags=["credit-cards"])


def _add_months(d: date, n: int) -> date:
    """Advance d by n months, keeping day=1."""
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


def _first_billing_month(purchase_date: date, closing_day: int) -> date:
    """Return the first month (as date(Y,M,1)) when the bill is charged."""
    base = purchase_date.replace(day=1)
    if purchase_date.day <= closing_day:
        return base
    return _add_months(base, 1)


# ── Cards ──────────────────────────────────────────────────────────────────


@router.get("", response_model=list[CreditCardOut])
async def list_cards(db: DB, tenant_id: TenantID):
    result = await db.execute(
        select(CreditCard).where(CreditCard.tenant_id == tenant_id).order_by(CreditCard.name)
    )
    return result.scalars().all()


@router.post("", response_model=CreditCardOut, status_code=status.HTTP_201_CREATED)
async def create_card(body: CreditCardCreate, db: DB, user: CurrentUser, tenant_id: TenantID):
    card = CreditCard(**body.model_dump(), tenant_id=tenant_id)
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


@router.get("/{card_id}", response_model=CreditCardOut)
async def get_card(card_id: int, db: DB, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    return card


@router.put("/{card_id}", response_model=CreditCardOut)
async def update_card(card_id: int, body: CreditCardUpdate, db: DB, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(card, field, value)
    await db.commit()
    await db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(card_id: int, db: DB, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    await db.delete(card)
    await db.commit()


# ── Purchases ──────────────────────────────────────────────────────────────


@router.get("/{card_id}/purchases", response_model=list[PurchaseOut])
async def list_purchases(card_id: int, db: DB, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    result = await db.execute(
        select(CreditCardPurchase)
        .where(CreditCardPurchase.card_id == card_id)
        .order_by(CreditCardPurchase.purchase_date.desc())
    )
    return result.scalars().all()


@router.post("/{card_id}/purchases", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED)
async def create_purchase(
    card_id: int, body: PurchaseCreate, db: DB, user: CurrentUser, tenant_id: TenantID
):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    purchase = CreditCardPurchase(
        **body.model_dump(),
        card_id=card_id,
        tenant_id=tenant_id,
        created_by=user.id,
    )
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)
    return purchase


@router.delete("/{card_id}/purchases/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(card_id: int, purchase_id: int, db: DB, tenant_id: TenantID):
    purchase = await db.get(CreditCardPurchase, purchase_id)
    if not purchase or purchase.card_id != card_id or purchase.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Purchase not found")
    await db.delete(purchase)
    await db.commit()


# ── Invoice ────────────────────────────────────────────────────────────────


@router.get("/{card_id}/invoice", response_model=InvoiceOut)
async def get_invoice(card_id: int, month: int, year: int, db: DB, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")

    result = await db.execute(
        select(CreditCardPurchase).where(CreditCardPurchase.card_id == card_id)
    )
    all_purchases = result.scalars().all()

    items: list[InvoiceItem] = []
    for p in all_purchases:
        first_month = _first_billing_month(p.purchase_date, card.closing_day)
        amount_per = (p.total_amount / p.installments).quantize(Decimal("0.01"))
        for k in range(p.installments):
            inst_month = _add_months(first_month, k)
            if inst_month.year == year and inst_month.month == month:
                items.append(
                    InvoiceItem(
                        purchase_id=p.id,
                        description=p.description,
                        purchase_date=p.purchase_date,
                        installment_number=k + 1,
                        installments=p.installments,
                        installment_amount=amount_per,
                    )
                )

    total = sum(i.installment_amount for i in items)
    return InvoiceOut(card_id=card_id, month=month, year=year, total=total, items=items)
