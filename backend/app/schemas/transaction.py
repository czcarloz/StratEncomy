from datetime import date as Date, datetime
from decimal import Decimal

from pydantic import BaseModel, field_validator

from app.models.transaction import TransactionType


class CategoryCreate(BaseModel):
    name: str
    type: TransactionType
    color: str | None = None

    @field_validator("color")
    @classmethod
    def valid_color(cls, v: str | None) -> str | None:
        if v is not None and (len(v) != 7 or not v.startswith("#")):
            raise ValueError("Color must be a hex value like #RRGGBB")
        return v


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class CategoryRead(BaseModel):
    id: int
    tenant_id: int
    type: TransactionType
    name: str
    color: str | None

    model_config = {"from_attributes": True}


class TransactionCreate(BaseModel):
    category_id: int
    type: TransactionType
    amount: Decimal
    description: str | None = None
    date: Date

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be greater than zero")
        return v


class TransactionUpdate(BaseModel):
    category_id: int | None = None
    amount: Decimal | None = None
    description: str | None = None
    date: Date | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Decimal | None) -> Decimal | None:
        if v is not None and v <= 0:
            raise ValueError("Amount must be greater than zero")
        return v


class TransactionRead(BaseModel):
    id: int
    tenant_id: int
    category_id: int
    type: TransactionType
    amount: Decimal
    description: str | None
    date: Date
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}
