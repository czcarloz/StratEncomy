from datetime import date as _Date, datetime
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
    currency: str = "BRL"


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_class: AssetClass | None = None
    currency: str | None = None


class AssetOut(BaseModel):
    id: int
    portfolio_id: int
    tenant_id: int
    ticker: str
    name: str | None
    asset_class: AssetClass
    currency: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Investment Transaction ────────────────────────────────────────────────────

class OperationCreate(BaseModel):
    type: OperationType
    quantity: Decimal
    unit_price: Decimal
    date: _Date
    broker: str | None = None
    note: str | None = None

    @field_validator("quantity", "unit_price")
    @classmethod
    def must_be_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Must be greater than zero")
        return v


class OperationUpdate(BaseModel):
    type: OperationType | None = None
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    date: _Date | None = None
    broker: str | None = None
    note: str | None = None


class OperationOut(BaseModel):
    id: int
    asset_id: int
    portfolio_id: int
    tenant_id: int
    type: OperationType
    quantity: Decimal
    unit_price: Decimal
    total_amount: Decimal
    date: _Date
    broker: str | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dividend ──────────────────────────────────────────────────────────────────

class DividendCreate(BaseModel):
    amount: Decimal
    date: _Date
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
    date: _Date
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Position (computed) ───────────────────────────────────────────────────────

class AssetPosition(BaseModel):
    asset_id: int
    ticker: str
    name: str | None
    asset_class: AssetClass
    currency: str
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


class MonthlyInvestmentPoint(BaseModel):
    year: int
    month: int
    total_invested: Decimal  # custo acumulado
    market_value: Decimal    # valor a mercado no fim do mês
