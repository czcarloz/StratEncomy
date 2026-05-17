from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class PlannedInvestmentCreate(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)
    asset_label: str = Field(..., min_length=1, max_length=200)
    amount_planned: Decimal = Field(..., gt=0)
    note: str | None = Field(None, max_length=500)


class PlannedInvestmentUpdate(BaseModel):
    asset_label: str | None = Field(None, min_length=1, max_length=200)
    amount_planned: Decimal | None = Field(None, gt=0)
    note: str | None = None


class PlannedInvestmentOut(BaseModel):
    id: int
    tenant_id: int
    month: int
    year: int
    asset_label: str
    amount_planned: Decimal
    note: str | None
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}
