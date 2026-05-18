"""Transactions export — PDF and XLSX."""
from __future__ import annotations

import calendar
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import io

from sqlalchemy import extract, func, case, select

from app.core.deps import DB, TenantID
from app.models.transaction import Category, Transaction, TransactionType
from app.services.report_service import (
    CategoryRow,
    ReportData,
    TransactionRow,
    generate_pdf,
    generate_xlsx,
)

router = APIRouter(prefix="/reports", tags=["reports"])

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


@router.get("/transactions")
async def export_transactions(
    db: DB,
    tenant_id: TenantID,
    format: Literal["pdf", "xlsx"] = Query(..., description="pdf or xlsx"),
    year: int = Query(..., ge=2000, le=2100),
    month: int | None = Query(None, ge=1, le=12),
):
    def _base_filters():
        filters = [
            Transaction.tenant_id == tenant_id,
            extract("year", Transaction.date) == year,
        ]
        if month is not None:
            filters.append(extract("month", Transaction.date) == month)
        return filters

    # ── Totals ────────────────────────────────────────────────────────────────
    totals_row = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(case((Transaction.type == TransactionType.income, Transaction.amount), else_=0)),
                    Decimal("0"),
                ).label("income"),
                func.coalesce(
                    func.sum(case((Transaction.type == TransactionType.expense, Transaction.amount), else_=0)),
                    Decimal("0"),
                ).label("expense"),
                func.coalesce(
                    func.sum(case((Transaction.type == TransactionType.investment, Transaction.amount), else_=0)),
                    Decimal("0"),
                ).label("investment"),
            ).where(*_base_filters())
        )
    ).one()

    income = totals_row.income or Decimal("0")
    expense = totals_row.expense or Decimal("0")
    investment = totals_row.investment or Decimal("0")
    balance = income - expense - investment

    # ── Category breakdown (expenses only) ───────────────────────────────────
    cat_rows = (
        await db.execute(
            select(
                Category.name,
                func.sum(Transaction.amount).label("total"),
            )
            .join(Category, Category.id == Transaction.category_id)
            .where(*_base_filters(), Transaction.type == TransactionType.expense)
            .group_by(Category.name)
            .order_by(func.sum(Transaction.amount).desc())
        )
    ).all()

    total_exp = expense if expense > 0 else Decimal("1")
    categories = [
        CategoryRow(
            name=r.name,
            amount=r.total,
            percentage=round(float(r.total / total_exp) * 100, 1),
        )
        for r in cat_rows
    ]

    # ── Transaction rows ──────────────────────────────────────────────────────
    tx_rows = (
        await db.execute(
            select(
                Transaction.date,
                Transaction.description,
                Transaction.type,
                Transaction.amount,
                Category.name.label("category_name"),
            )
            .join(Category, Category.id == Transaction.category_id)
            .where(*_base_filters())
            .order_by(Transaction.date.desc())
        )
    ).all()

    transactions = [
        TransactionRow(
            date=r.date.strftime("%d/%m/%Y"),
            description=r.description or "",
            category=r.category_name,
            type=r.type.value,
            amount=r.amount,
        )
        for r in tx_rows
    ]

    period_label = f"{MONTH_NAMES[month - 1]} {year}" if month else str(year)
    filename_base = f"transactions_{year}_{month:02d}" if month else f"transactions_{year}"

    data = ReportData(
        month_label=period_label,
        total_income=income,
        total_expense=expense,
        total_investment=investment,
        balance=balance,
        categories=categories,
        transactions=transactions,
    )

    if format == "pdf":
        content = generate_pdf(data)
        media_type = "application/pdf"
        filename = f"{filename_base}.pdf"
    else:
        content = generate_xlsx(data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"{filename_base}.xlsx"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
