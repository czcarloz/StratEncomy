from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DB, TenantID
from app.models.planned_investment import PlannedInvestment
from app.schemas.planned_investment import (
    PlannedInvestmentCreate,
    PlannedInvestmentOut,
    PlannedInvestmentUpdate,
)

router = APIRouter(prefix="/planned-investments", tags=["planned-investments"])


@router.get("", response_model=list[PlannedInvestmentOut])
async def list_planned(
    db: DB,
    tenant_id: TenantID,
    month: int | None = None,
    year: int | None = None,
):
    stmt = select(PlannedInvestment).where(PlannedInvestment.tenant_id == tenant_id)
    if month:
        stmt = stmt.where(PlannedInvestment.month == month)
    if year:
        stmt = stmt.where(PlannedInvestment.year == year)
    stmt = stmt.order_by(PlannedInvestment.year.desc(), PlannedInvestment.month.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=PlannedInvestmentOut, status_code=status.HTTP_201_CREATED)
async def create_planned(
    body: PlannedInvestmentCreate, db: DB, user: CurrentUser, tenant_id: TenantID
):
    entry = PlannedInvestment(**body.model_dump(), tenant_id=tenant_id, created_by=user.id)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=PlannedInvestmentOut)
async def update_planned(
    entry_id: int, body: PlannedInvestmentUpdate, db: DB, tenant_id: TenantID
):
    entry = await db.get(PlannedInvestment, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(entry, field, value)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_planned(entry_id: int, db: DB, tenant_id: TenantID):
    entry = await db.get(PlannedInvestment, entry_id)
    if not entry or entry.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    await db.delete(entry)
    await db.commit()
