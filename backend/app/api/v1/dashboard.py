from decimal import Decimal

from fastapi import APIRouter
from sqlalchemy import case, extract, func, select

from app.core.deps import DB, TenantID
from app.models.transaction import Category, Transaction, TransactionType
from pydantic import BaseModel

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ── Schemas ────────────────────────────────────────────────────────────────


class CategoryBreakdown(BaseModel):
    category_id: int
    name: str
    amount: Decimal
    percentage: float


class MonthTotals(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    total_investment: Decimal
    balance: Decimal


class SummaryOut(BaseModel):
    month: int
    year: int
    total_income: Decimal
    total_expense: Decimal
    total_investment: Decimal
    balance: Decimal
    expense_by_category: list[CategoryBreakdown]
    prev_month: MonthTotals


class MonthlyPoint(BaseModel):
    month: int
    total_income: Decimal
    total_expense: Decimal
    total_investment: Decimal
    balance: Decimal


# ── Helpers ────────────────────────────────────────────────────────────────


def _prev(month: int, year: int) -> tuple[int, int]:
    if month == 1:
        return 12, year - 1
    return month - 1, year


async def _month_totals(db: DB, tenant_id: int, month: int, year: int) -> MonthTotals:
    row = (
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
            ).where(
                Transaction.tenant_id == tenant_id,
                extract("month", Transaction.date) == month,
                extract("year", Transaction.date) == year,
            )
        )
    ).one()

    income = row.income or Decimal("0")
    expense = row.expense or Decimal("0")
    investment = row.investment or Decimal("0")
    return MonthTotals(
        total_income=income,
        total_expense=expense,
        total_investment=investment,
        balance=income - expense - investment,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────


@router.get("/summary", response_model=SummaryOut)
async def get_summary(month: int, year: int, db: DB, tenant_id: TenantID):
    current = await _month_totals(db, tenant_id, month, year)
    prev_m, prev_y = _prev(month, year)
    prev = await _month_totals(db, tenant_id, prev_m, prev_y)

    # Expenses by category
    cat_rows = (
        await db.execute(
            select(
                Transaction.category_id,
                Category.name,
                func.sum(Transaction.amount).label("total"),
            )
            .join(Category, Category.id == Transaction.category_id)
            .where(
                Transaction.tenant_id == tenant_id,
                Transaction.type == TransactionType.expense,
                extract("month", Transaction.date) == month,
                extract("year", Transaction.date) == year,
            )
            .group_by(Transaction.category_id, Category.name)
            .order_by(func.sum(Transaction.amount).desc())
        )
    ).all()

    total_exp = current.total_expense or Decimal("1")
    breakdown = [
        CategoryBreakdown(
            category_id=r.category_id,
            name=r.name,
            amount=r.total,
            percentage=round(float(r.total / total_exp) * 100, 1),
        )
        for r in cat_rows
    ]

    return SummaryOut(
        month=month,
        year=year,
        total_income=current.total_income,
        total_expense=current.total_expense,
        total_investment=current.total_investment,
        balance=current.balance,
        expense_by_category=breakdown,
        prev_month=prev,
    )


@router.get("/yearly", response_model=list[MonthlyPoint])
async def get_yearly(year: int, db: DB, tenant_id: TenantID):
    rows = (
        await db.execute(
            select(
                extract("month", Transaction.date).label("month"),
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
            )
            .where(
                Transaction.tenant_id == tenant_id,
                extract("year", Transaction.date) == year,
            )
            .group_by(extract("month", Transaction.date))
            .order_by(extract("month", Transaction.date))
        )
    ).all()

    data: dict[int, MonthlyPoint] = {}
    for r in rows:
        m = int(r.month)
        inc = r.income or Decimal("0")
        exp = r.expense or Decimal("0")
        inv = r.investment or Decimal("0")
        data[m] = MonthlyPoint(
            month=m,
            total_income=inc,
            total_expense=exp,
            total_investment=inv,
            balance=inc - exp - inv,
        )

    # Fill missing months with zeros
    return [
        data.get(
            m,
            MonthlyPoint(
                month=m,
                total_income=Decimal("0"),
                total_expense=Decimal("0"),
                total_investment=Decimal("0"),
                balance=Decimal("0"),
            ),
        )
        for m in range(1, 13)
    ]
