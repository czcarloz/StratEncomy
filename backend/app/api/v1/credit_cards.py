from datetime import date
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, status
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
from app.services.audit import client_ip, log as audit

router = APIRouter(prefix="/credit-cards", tags=["credit-cards"])


def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


def _first_billing_month(purchase_date: date, closing_day: int) -> date:
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
async def create_card(request: Request, body: CreditCardCreate, db: DB, user: CurrentUser, tenant_id: TenantID):
    card = CreditCard(**body.model_dump(), tenant_id=tenant_id)
    db.add(card)
    await db.flush()
    await audit(db, "credit_card.create", user_id=user.id, tenant_id=tenant_id,
                entity="credit_card", entity_id=card.id,
                payload={"name": body.name}, ip=client_ip(request))
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
async def update_card(request: Request, card_id: int, body: CreditCardUpdate, db: DB, user: CurrentUser, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    data = body.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(card, field, value)
    await audit(db, "credit_card.update", user_id=user.id, tenant_id=tenant_id,
                entity="credit_card", entity_id=card_id,
                payload=data, ip=client_ip(request))
    await db.commit()
    await db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_card(request: Request, card_id: int, db: DB, user: CurrentUser, tenant_id: TenantID):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    await audit(db, "credit_card.delete", user_id=user.id, tenant_id=tenant_id,
                entity="credit_card", entity_id=card_id,
                payload={"name": card.name}, ip=client_ip(request))
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
    request: Request, card_id: int, body: PurchaseCreate, db: DB, user: CurrentUser, tenant_id: TenantID
):
    card = await db.get(CreditCard, card_id)
    if not card or card.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
    purchase = CreditCardPurchase(**body.model_dump(), card_id=card_id, tenant_id=tenant_id, created_by=user.id)
    db.add(purchase)
    await db.flush()
    await audit(db, "purchase.create", user_id=user.id, tenant_id=tenant_id,
                entity="purchase", entity_id=purchase.id,
                payload={"description": body.description, "total": str(body.total_amount),
                         "installments": body.installments, "card_id": card_id},
                ip=client_ip(request))
    await db.commit()
    await db.refresh(purchase)
    return purchase


@router.delete("/{card_id}/purchases/{purchase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase(request: Request, card_id: int, purchase_id: int, db: DB, user: CurrentUser, tenant_id: TenantID):
    purchase = await db.get(CreditCardPurchase, purchase_id)
    if not purchase or purchase.card_id != card_id or purchase.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Purchase not found")
    await audit(db, "purchase.delete", user_id=user.id, tenant_id=tenant_id,
                entity="purchase", entity_id=purchase_id,
                payload={"description": purchase.description, "card_id": card_id},
                ip=client_ip(request))
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
