from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.portfolio import AssetClass, OperationType


# ── Portfolio ─────────────────────────────────────────────────────────────────

class PortfolioCreate(BaseModel):
    name: str
    description: str | None = None


class PortfolioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class PortfolioOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Asset ─────────────────────────────────────────────────────────────────────

class AssetCreate(BaseModel):
    ticker: str
    name: str | None = None
    asset_class: AssetClass = AssetClass.stock


class AssetOut(BaseModel):
    id: int
    portfolio_id: int
    tenant_id: int
    ticker: str
    name: str | None
    asset_class: AssetClass
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Investment Transaction ────────────────────────────────────────────────────

class OperationCreate(BaseModel):
    type: OperationType
    quantity: Decimal
    unit_price: Decimal
    date: date
    broker: str | None = None
    note: str | None = None

    @field_validator("quantity", "unit_price")
    @classmethod
    def must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Must be greater than zero")
        return v


class OperationOut(BaseModel):
    id: int
    asset_id: int
    portfolio_id: int
    tenant_id: int
    type: OperationType
    quantity: Decimal
    unit_price: Decimal
    total_amount: Decimal
    date: date
    broker: str | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dividend ──────────────────────────────────────────────────────────────────

class DividendCreate(BaseModel):
    amount: Decimal
    date: date
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Must be greater than zero")
        return v


class DividendOut(BaseModel):
    id: int
    asset_id: int
    portfolio_id: int
    tenant_id: int
    amount: Decimal
    date: date
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Position (computed) ───────────────────────────────────────────────────────

class AssetPosition(BaseModel):
    asset_id: int
    ticker: str
    name: str | None
    asset_class: AssetClass
    quantity: Decimal
    avg_price: Decimal
    total_invested: Decimal
    total_dividends: Decimal


class PortfolioPosition(BaseModel):
    portfolio_id: int
    name: str
    total_invested: Decimal
    total_dividends: Decimal
    positions: list[AssetPosition]


# ── Dashboard ─────────────────────────────────────────────────────────────────

class AllocationItem(BaseModel):
    asset_class: str
    total_invested: Decimal
    percentage: float


class DividendsByMonth(BaseModel):
    year: int
    month: int
    total: Decimal


class PortfolioDashboard(BaseModel):
    portfolio_id: int
    name: str
    total_invested: Decimal
    total_dividends: Decimal
    allocation: list[AllocationItem]
    dividends_by_month: list[DividendsByMonth]


# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str
    patrimony_target: Decimal | None = None
    dividends_target: Decimal | None = None


class GoalUpdate(BaseModel):
    name: str | None = None
    patrimony_target: Decimal | None = None
    dividends_target: Decimal | None = None


class GoalOut(BaseModel):
    id: int
    portfolio_id: int
    tenant_id: int
    name: str
    patrimony_target: Decimal | None
    dividends_target: Decimal | None
    created_at: datetime

    model_config = {"from_attributes": True}
