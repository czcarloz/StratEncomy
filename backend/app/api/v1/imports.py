"""B3 import endpoints — preview + confirm."""
from __future__ import annotations

from datetime import date as date_type
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DB, TenantID
from app.models.portfolio import Asset, Dividend, InvestmentTransaction, OperationType, Portfolio
from app.services.audit import client_ip, log as audit
from app.services.b3_import_service import parse_b3_xlsx, _guess_asset_class

router = APIRouter(prefix="/portfolios/{portfolio_id}/import", tags=["imports"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class OperationIn(BaseModel):
    ticker: str
    op_type: str
    quantity: str
    unit_price: str
    date: str
    broker: str | None = None


class DividendIn(BaseModel):
    ticker: str
    amount: str
    date: str
    note: str | None = None


class PreviewResponse(BaseModel):
    operations: list[OperationIn]
    dividends: list[DividendIn]
    skipped_count: int
    skipped_reasons: list[str]


class ConfirmRequest(BaseModel):
    operations: list[OperationIn]
    dividends: list[DividendIn]


class ConfirmResponse(BaseModel):
    operations_created: int
    dividends_created: int
    assets_created: int


# ── Helper ────────────────────────────────────────────────────────────────────

async def _get_portfolio_or_404(db: DB, portfolio_id: int, tenant_id: int) -> Portfolio:
    result = await db.scalars(
        select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.tenant_id == tenant_id)
    )
    p = result.first()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/preview", response_model=PreviewResponse)
async def import_preview(
    portfolio_id: int,
    db: DB,
    tenant_id: TenantID,
    file: UploadFile = File(...),
):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)

    content = await file.read()
    try:
        result = parse_b3_xlsx(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    reasons = sorted({s.movimentacao for s in result.skipped if s.movimentacao})

    return PreviewResponse(
        operations=[
            OperationIn(
                ticker=o.ticker,
                op_type=o.op_type,
                quantity=o.quantity,
                unit_price=o.unit_price,
                date=o.date,
                broker=o.broker,
            )
            for o in result.operations
        ],
        dividends=[
            DividendIn(ticker=d.ticker, amount=d.amount, date=d.date, note=d.note)
            for d in result.dividends
        ],
        skipped_count=len(result.skipped),
        skipped_reasons=reasons,
    )


@router.post("/confirm", response_model=ConfirmResponse, status_code=status.HTTP_201_CREATED)
async def import_confirm(
    request: Request,
    portfolio_id: int,
    body: ConfirmRequest,
    db: DB,
    user: CurrentUser,
    tenant_id: TenantID,
):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)

    # Load existing assets in this portfolio
    existing_assets = (await db.scalars(
        select(Asset).where(Asset.portfolio_id == portfolio_id)
    )).all()
    asset_map: dict[str, Asset] = {a.ticker.upper(): a for a in existing_assets}

    assets_created = 0
    ops_created = 0
    divs_created = 0

    # Collect all tickers referenced
    all_tickers: set[str] = set()
    for op in body.operations:
        all_tickers.add(op.ticker.upper())
    for div in body.dividends:
        all_tickers.add(div.ticker.upper())

    # Create missing assets
    for ticker in sorted(all_tickers):
        if ticker not in asset_map:
            asset = Asset(
                portfolio_id=portfolio_id,
                tenant_id=tenant_id,
                ticker=ticker,
                asset_class=_guess_asset_class(ticker),
            )
            db.add(asset)
            await db.flush()
            asset_map[ticker] = asset
            assets_created += 1

    # Create operations
    for op in body.operations:
        asset = asset_map[op.ticker.upper()]
        qty = Decimal(op.quantity)
        price = Decimal(op.unit_price)
        inv_op = InvestmentTransaction(
            asset_id=asset.id,
            portfolio_id=portfolio_id,
            tenant_id=tenant_id,
            type=OperationType.buy if op.op_type == "buy" else OperationType.sell,
            quantity=qty,
            unit_price=price,
            total_amount=(qty * price).quantize(Decimal("0.01")),
            date=date_type.fromisoformat(op.date),
            broker=op.broker,
            created_by=user.id,
        )
        db.add(inv_op)
        ops_created += 1

    # Create dividends
    for div in body.dividends:
        asset = asset_map[div.ticker.upper()]
        dividend = Dividend(
            asset_id=asset.id,
            portfolio_id=portfolio_id,
            tenant_id=tenant_id,
            amount=Decimal(div.amount),
            date=date_type.fromisoformat(div.date),
            note=div.note,
            created_by=user.id,
        )
        db.add(dividend)
        divs_created += 1

    await audit(
        db, "portfolio.import_b3",
        user_id=user.id, tenant_id=tenant_id,
        entity="portfolio", entity_id=portfolio_id,
        payload={"ops": ops_created, "divs": divs_created, "assets": assets_created},
        ip=client_ip(request),
    )
    await db.commit()

    return ConfirmResponse(
        operations_created=ops_created,
        dividends_created=divs_created,
        assets_created=assets_created,
    )
