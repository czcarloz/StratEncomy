"""Transactions and portfolio export — PDF and XLSX."""
from __future__ import annotations

import calendar
from datetime import date as date_type
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
import io

from sqlalchemy import extract, func, case, select

from app.core.deps import DB, TenantID
from app.models.transaction import Category, Transaction, TransactionType
from app.models.portfolio import Asset, Dividend, InvestmentTransaction, OperationType, Portfolio
from app.services.report_service import (
    AllocationRow,
    CategoryRow,
    DividendRow,
    PortfolioReportData,
    PositionRow,
    ReportData,
    TransactionRow,
    generate_pdf,
    generate_portfolio_pdf,
    generate_portfolio_xlsx,
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


@router.get("/portfolio")
async def export_portfolio(
    db: DB,
    tenant_id: TenantID,
    portfolio_id: int = Query(...),
    format: Literal["pdf", "xlsx"] = Query(...),
):
    portfolio = await db.get(Portfolio, portfolio_id)
    if not portfolio or portfolio.tenant_id != tenant_id:
        raise HTTPException(404, "Portfolio not found")

    assets = (await db.scalars(select(Asset).where(Asset.portfolio_id == portfolio_id))).all()

    positions: list[PositionRow] = []
    all_dividends: list[DividendRow] = []
    class_totals: dict[str, Decimal] = {}
    total_invested = Decimal("0")
    total_dividends_sum = Decimal("0")

    for asset in assets:
        ops = (await db.scalars(select(InvestmentTransaction).where(InvestmentTransaction.asset_id == asset.id))).all()
        divs = (await db.scalars(select(Dividend).where(Dividend.asset_id == asset.id))).all()

        qty = Decimal("0")
        cost = Decimal("0")
        for op in sorted(ops, key=lambda o: o.date):
            if op.type == OperationType.buy:
                cost += op.quantity * op.unit_price
                qty += op.quantity
            else:
                if qty > 0:
                    avg = cost / qty
                    cost -= op.quantity * avg
                    qty -= op.quantity
                    if qty <= 0:
                        qty = Decimal("0"); cost = Decimal("0")

        avg_price = (cost / qty).quantize(Decimal("0.00000001")) if qty > 0 else Decimal("0")
        invested = (qty * avg_price).quantize(Decimal("0.01"))
        asset_divs = sum((d.amount for d in divs), Decimal("0"))

        if qty > 0 or asset_divs > 0:
            positions.append(PositionRow(
                ticker=asset.ticker, name=asset.name or "",
                asset_class=asset.asset_class.value,
                quantity=qty, avg_price=avg_price,
                total_invested=invested, total_dividends=asset_divs,
            ))
            cls = asset.asset_class.value
            class_totals[cls] = class_totals.get(cls, Decimal("0")) + invested
            total_invested += invested
            total_dividends_sum += asset_divs

        for div in sorted(divs, key=lambda d: d.date, reverse=True):
            all_dividends.append(DividendRow(
                date=div.date.strftime("%d/%m/%Y"),
                ticker=asset.ticker,
                amount=div.amount,
                note=div.note or "",
            ))

    denom = total_invested if total_invested > 0 else Decimal("1")
    allocation = [
        AllocationRow(asset_class=cls, total_invested=val,
                      percentage=round(float(val / denom) * 100, 1))
        for cls, val in sorted(class_totals.items(), key=lambda x: -x[1]) if val > 0
    ]

    data = PortfolioReportData(
        portfolio_name=portfolio.name,
        generated_at=date_type.today().strftime("%d/%m/%Y"),
        total_invested=total_invested,
        total_dividends=total_dividends_sum,
        positions=sorted(positions, key=lambda p: -float(p.total_invested)),
        dividends=all_dividends,
        allocation=allocation,
    )

    safe_name = portfolio.name.replace(" ", "_").lower()
    if format == "pdf":
        content = generate_portfolio_pdf(data)
        media_type = "application/pdf"
        filename = f"portfolio_{safe_name}.pdf"
    else:
        content = generate_portfolio_xlsx(data)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"portfolio_{safe_name}.xlsx"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
