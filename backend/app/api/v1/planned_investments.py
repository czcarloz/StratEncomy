from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.deps import AdminUser, CurrentUser, DB, TenantID
from app.models.planned_investment import PlannedInvestment
from app.schemas.planned_investment import (
    PlannedInvestmentCreate,
    PlannedInvestmentOut,
    PlannedInvestmentUpdate,
)
from app.services.audit import client_ip, log as audit

router = APIRouter(prefix="/planned-investments", tags=["planned-investments"])


@router.get("", response_model=list[PlannedInvestmentOut])
async def list_planned(
    db: DB,
    tenant_id: TenantID,
    month: int | None = None,
    year: int | None = None,
    portfolio_id: int | None = None,
):
    stmt = select(PlannedInvestment).where(PlannedInvestment.tenant_id == tenant_id)
    if month:
        stmt = stmt.where(PlannedInvestment.month == month)
    if year:
        stmt = stmt.where(PlannedInvestment.year == year)
    if portfolio_id is not None:
        stmt = stmt.where(PlannedInvestment.portfolio_id == portfolio_id)
    stmt = stmt.order_by(PlannedInvestment.year.desc(), PlannedInvestment.month.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PlannedInvestmentOut, status_code=status.HTTP_201_CREATED)
async def create_planned(
    request: Request, body: PlannedInvestmentCreate, db: DB, user: AdminUser, tenant_id: TenantID
):
    entry = PlannedInvestment(**body.model_dump(), tenant_id=tenant_id, created_by=user.id)
    db.add(entry)
    await db.flush()
    await audit(db, "planned_investment.create", user_id=user.id, tenant_id=tenant_id,
                entity="planned_investment", entity_id=entry.id,
                payload={"asset": body.asset_label, "amount": str(body.amount_planned),
                         "month": body.month, "year": body.year},
                ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=PlannedInvestmentOut)
async def update_planned(
    request: Request, entry_id: int, body: PlannedInvestmentUpdate, db: DB,
    user: AdminUser, tenant_id: TenantID
):
    entry = await db.get(PlannedInvestment, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    data = body.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(entry, field, value)
    await audit(db, "planned_investment.update", user_id=user.id, tenant_id=tenant_id,
                entity="planned_investment", entity_id=entry_id,
                payload={k: str(v) for k, v in data.items()}, ip=client_ip(request))
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_planned(request: Request, entry_id: int, db: DB, user: AdminUser, tenant_id: TenantID):
    entry = await db.get(PlannedInvestment, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    await audit(db, "planned_investment.delete", user_id=user.id, tenant_id=tenant_id,
                entity="planned_investment", entity_id=entry_id,
                payload={"asset": entry.asset_label}, ip=client_ip(request))
    await db.delete(entry)
    await db.commit()
