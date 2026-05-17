from datetime import date as Date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CreditCardCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    closing_day: int = Field(..., ge=1, le=28)
    due_day: int = Field(..., ge=1, le=28)
    limit: Decimal | None = Field(None, gt=0)


class CreditCardUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    closing_day: int | None = Field(None, ge=1, le=28)
    due_day: int | None = Field(None, ge=1, le=28)
    limit: Decimal | None = None


class CreditCardOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    closing_day: int
    due_day: int
    limit: Decimal | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=500)
    total_amount: Decimal = Field(..., gt=0)
    installments: int = Field(1, ge=1, le=48)
    purchase_date: Date


class PurchaseOut(BaseModel):
    id: int
    card_id: int
    tenant_id: int
    description: str
    total_amount: Decimal
    installments: int
    purchase_date: Date
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InvoiceItem(BaseModel):
    purchase_id: int
    description: str
    purchase_date: Date
    installment_number: int
    installments: int
    installment_amount: Decimal


class InvoiceOut(BaseModel):
    card_id: int
    month: int
    year: int
    total: Decimal
    items: list[InvoiceItem]
