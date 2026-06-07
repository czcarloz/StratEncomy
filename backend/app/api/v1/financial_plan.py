from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import AdminUser, CurrentUser, DB, TenantID
from app.models.financial_plan import FinancialGoal, FinancialPlanConfig, FinancialPlanPhase
from app.schemas.financial_plan import (
    GoalCreate, GoalOut, GoalUpdate,
    PhaseCreate, PhaseOut, PhaseUpdate,
    PlanConfigOut, PlanConfigUpsert,
)

router = APIRouter(prefix="/financial-plan", tags=["financial-plan"])


# ── Config ────────────────────────────────────────────────────────────────────

@router.get("/config", response_model=PlanConfigOut)
async def get_config(db: DB, tenant_id: TenantID):
    cfg = await db.scalar(
        select(FinancialPlanConfig).where(FinancialPlanConfig.tenant_id == tenant_id)
    )
    if not cfg:
        return PlanConfigOut(initial_patrimony=0, monthly_rate="0.010000", horizon_years=3)
    return cfg


@router.put("/config", response_model=PlanConfigOut)
async def upsert_config(body: PlanConfigUpsert, db: DB, tenant_id: TenantID, user: AdminUser):
    cfg = await db.scalar(
        select(FinancialPlanConfig).where(FinancialPlanConfig.tenant_id == tenant_id)
    )
    if cfg:
        cfg.initial_patrimony = body.initial_patrimony
        cfg.monthly_rate = body.monthly_rate
        cfg.horizon_years = body.horizon_years
    else:
        cfg = FinancialPlanConfig(**body.model_dump(), tenant_id=tenant_id)
        db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return cfg


# ── Phases ────────────────────────────────────────────────────────────────────

@router.get("/phases", response_model=list[PhaseOut])
async def list_phases(db: DB, tenant_id: TenantID):
    result = await db.scalars(
        select(FinancialPlanPhase)
        .where(FinancialPlanPhase.tenant_id == tenant_id)
        .order_by(FinancialPlanPhase.start_year, FinancialPlanPhase.start_month)
    )
    return result.all()


@router.post("/phases", response_model=PhaseOut, status_code=status.HTTP_201_CREATED)
async def create_phase(body: PhaseCreate, db: DB, tenant_id: TenantID, user: AdminUser):
    phase = FinancialPlanPhase(**body.model_dump(), tenant_id=tenant_id)
    db.add(phase)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.patch("/phases/{phase_id}", response_model=PhaseOut)
async def update_phase(phase_id: int, body: PhaseUpdate, db: DB, tenant_id: TenantID, user: AdminUser):
    phase = await db.get(FinancialPlanPhase, phase_id)
    if not phase or phase.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Phase not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(phase, k, v)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.delete("/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(phase_id: int, db: DB, tenant_id: TenantID, user: AdminUser):
    phase = await db.get(FinancialPlanPhase, phase_id)
    if not phase or phase.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Phase not found")
    await db.delete(phase)
    await db.commit()


# ── Goals ─────────────────────────────────────────────────────────────────────

@router.get("/goals", response_model=list[GoalOut])
async def list_goals(db: DB, tenant_id: TenantID):
    result = await db.scalars(
        select(FinancialGoal)
        .where(FinancialGoal.tenant_id == tenant_id)
        .order_by(FinancialGoal.target_date)
    )
    return result.all()


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
async def create_goal(body: GoalCreate, db: DB, tenant_id: TenantID, user: AdminUser):
    goal = FinancialGoal(**body.model_dump(), tenant_id=tenant_id)
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.patch("/goals/{goal_id}", response_model=GoalOut)
async def update_goal(goal_id: int, body: GoalUpdate, db: DB, tenant_id: TenantID, user: AdminUser):
    goal = await db.get(FinancialGoal, goal_id)
    if not goal or goal.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(goal, k, v)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: int, db: DB, tenant_id: TenantID, user: AdminUser):
    goal = await db.get(FinancialGoal, goal_id)
    if not goal or goal.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    await db.delete(goal)
    await db.commit()
