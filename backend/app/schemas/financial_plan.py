from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── Config ────────────────────────────────────────────────────────────────────

class PlanConfigUpsert(BaseModel):
    initial_patrimony: Decimal = Field(ge=0)
    monthly_rate: Decimal = Field(ge=0, le=1)
    horizon_years: int = Field(ge=1, le=30)


class PlanConfigOut(BaseModel):
    initial_patrimony: Decimal
    monthly_rate: Decimal
    horizon_years: int
    model_config = {"from_attributes": True}


# ── Phase ─────────────────────────────────────────────────────────────────────

class PhaseCreate(BaseModel):
    start_year: int = Field(ge=2000, le=2100)
    start_month: int = Field(ge=1, le=12)
    salary: Decimal = Field(ge=0)
    aporte: Decimal = Field(ge=0)
    gasto_maximo: Decimal = Field(ge=0)
    note: str | None = Field(None, max_length=200)


class PhaseUpdate(BaseModel):
    start_year: int | None = Field(None, ge=2000, le=2100)
    start_month: int | None = Field(None, ge=1, le=12)
    salary: Decimal | None = Field(None, ge=0)
    aporte: Decimal | None = Field(None, ge=0)
    gasto_maximo: Decimal | None = Field(None, ge=0)
    note: str | None = None


class PhaseOut(BaseModel):
    id: int
    tenant_id: int
    start_year: int
    start_month: int
    salary: Decimal
    aporte: Decimal
    gasto_maximo: Decimal
    note: str | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Goal ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    target_date: date
    target_amount: Decimal = Field(gt=0)
    actual_amount: Decimal | None = Field(None, ge=0)
    note: str | None = Field(None, max_length=500)


class GoalUpdate(BaseModel):
    description: str | None = Field(None, min_length=1, max_length=200)
    target_date: date | None = None
    target_amount: Decimal | None = Field(None, gt=0)
    actual_amount: Decimal | None = Field(None, ge=0)
    note: str | None = None


class GoalOut(BaseModel):
    id: int
    tenant_id: int
    description: str
    target_date: date
    target_amount: Decimal
    actual_amount: Decimal | None
    note: str | None
    created_at: datetime
    model_config = {"from_attributes": True}
