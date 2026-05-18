from decimal import Decimal

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DB, TenantID
from app.models.portfolio import Asset, Dividend, InvestmentTransaction, OperationType, Portfolio
from app.schemas.portfolio import (
    AssetCreate,
    AssetOut,
    AssetPosition,
    DividendCreate,
    DividendOut,
    OperationCreate,
    OperationOut,
    PortfolioCreate,
    PortfolioOut,
    PortfolioPosition,
    PortfolioUpdate,
)
from app.services.audit import client_ip, log as audit

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


def _compute_position(operations: list[InvestmentTransaction], dividends: list[Dividend]) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (quantity, avg_price, total_dividends)."""
    qty = Decimal("0")
    cost = Decimal("0")

    for op in sorted(operations, key=lambda o: o.date):
        if op.type == OperationType.buy:
            cost += op.quantity * op.unit_price
            qty += op.quantity
        else:
            if qty > 0:
                avg = cost / qty
                cost -= op.quantity * avg
                qty -= op.quantity
                if qty <= 0:
                    qty = Decimal("0")
                    cost = Decimal("0")

    avg_price = (cost / qty).quantize(Decimal("0.00000001")) if qty > 0 else Decimal("0")
    total_dividends = sum((d.amount for d in dividends), Decimal("0"))
    return qty, avg_price, total_dividends


# ── Portfolios ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[PortfolioOut])
async def list_portfolios(db: DB, tenant_id: TenantID):
    result = await db.scalars(
        select(Portfolio).where(Portfolio.tenant_id == tenant_id).order_by(Portfolio.name)
    )
    return result.all()


@router.post("", response_model=PortfolioOut, status_code=status.HTTP_201_CREATED)
async def create_portfolio(request: Request, body: PortfolioCreate, db: DB, user: CurrentUser, tenant_id: TenantID):
    portfolio = Portfolio(**body.model_dump(), tenant_id=tenant_id)
    db.add(portfolio)
    await db.flush()
    await audit(db, "portfolio.create", user_id=user.id, tenant_id=tenant_id,
                entity="portfolio", entity_id=portfolio.id,
                payload={"name": body.name}, ip=client_ip(request))
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


@router.get("/{portfolio_id}", response_model=PortfolioOut)
async def get_portfolio(portfolio_id: int, db: DB, tenant_id: TenantID):
    return await _get_portfolio_or_404(db, portfolio_id, tenant_id)


@router.put("/{portfolio_id}", response_model=PortfolioOut)
async def update_portfolio(request: Request, portfolio_id: int, body: PortfolioUpdate, db: DB, user: CurrentUser, tenant_id: TenantID):
    portfolio = await _get_portfolio_or_404(db, portfolio_id, tenant_id)
    data = body.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(portfolio, field, value)
    await audit(db, "portfolio.update", user_id=user.id, tenant_id=tenant_id,
                entity="portfolio", entity_id=portfolio_id,
                payload=data, ip=client_ip(request))
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio(request: Request, portfolio_id: int, db: DB, user: CurrentUser, tenant_id: TenantID):
    portfolio = await _get_portfolio_or_404(db, portfolio_id, tenant_id)
    await audit(db, "portfolio.delete", user_id=user.id, tenant_id=tenant_id,
                entity="portfolio", entity_id=portfolio_id,
                payload={"name": portfolio.name}, ip=client_ip(request))
    await db.delete(portfolio)
    await db.commit()


# ── Position summary ──────────────────────────────────────────────────────────

@router.get("/{portfolio_id}/position", response_model=PortfolioPosition)
async def get_position(portfolio_id: int, db: DB, tenant_id: TenantID):
    portfolio = await _get_portfolio_or_404(db, portfolio_id, tenant_id)

    assets = (await db.scalars(
        select(Asset).where(Asset.portfolio_id == portfolio_id)
    )).all()

    positions: list[AssetPosition] = []
    for asset in assets:
        ops = (await db.scalars(
            select(InvestmentTransaction).where(InvestmentTransaction.asset_id == asset.id)
        )).all()
        divs = (await db.scalars(
            select(Dividend).where(Dividend.asset_id == asset.id)
        )).all()

        qty, avg_price, total_divs = _compute_position(list(ops), list(divs))
        if qty > 0 or total_divs > 0:
            positions.append(AssetPosition(
                asset_id=asset.id,
                ticker=asset.ticker,
                name=asset.name,
                asset_class=asset.asset_class,
                quantity=qty,
                avg_price=avg_price,
                total_invested=(qty * avg_price).quantize(Decimal("0.01")),
                total_dividends=total_divs,
            ))

    total_invested = sum((p.total_invested for p in positions), Decimal("0"))
    total_dividends = sum((p.total_dividends for p in positions), Decimal("0"))

    return PortfolioPosition(
        portfolio_id=portfolio_id,
        name=portfolio.name,
        total_invested=total_invested,
        total_dividends=total_dividends,
        positions=positions,
    )


# ── Assets ────────────────────────────────────────────────────────────────────

@router.get("/{portfolio_id}/assets", response_model=list[AssetOut])
async def list_assets(portfolio_id: int, db: DB, tenant_id: TenantID):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)
    result = await db.scalars(
        select(Asset).where(Asset.portfolio_id == portfolio_id).order_by(Asset.ticker)
    )
    return result.all()


@router.post("/{portfolio_id}/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def add_asset(request: Request, portfolio_id: int, body: AssetCreate, db: DB, user: CurrentUser, tenant_id: TenantID):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)
    asset = Asset(**body.model_dump(), portfolio_id=portfolio_id, tenant_id=tenant_id)
    db.add(asset)
    await db.flush()
    await audit(db, "asset.create", user_id=user.id, tenant_id=tenant_id,
                entity="asset", entity_id=asset.id,
                payload={"ticker": body.ticker, "class": body.asset_class}, ip=client_ip(request))
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{portfolio_id}/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(request: Request, portfolio_id: int, asset_id: int, db: DB, user: CurrentUser, tenant_id: TenantID):
    asset = await _get_asset_or_404(db, asset_id, portfolio_id, tenant_id)
    await audit(db, "asset.delete", user_id=user.id, tenant_id=tenant_id,
                entity="asset", entity_id=asset_id,
                payload={"ticker": asset.ticker}, ip=client_ip(request))
    await db.delete(asset)
    await db.commit()


# ── Operations ────────────────────────────────────────────────────────────────

@router.get("/{portfolio_id}/assets/{asset_id}/operations", response_model=list[OperationOut])
async def list_operations(portfolio_id: int, asset_id: int, db: DB, tenant_id: TenantID):
    await _get_asset_or_404(db, asset_id, portfolio_id, tenant_id)
    result = await db.scalars(
        select(InvestmentTransaction)
        .where(InvestmentTransaction.asset_id == asset_id)
        .order_by(InvestmentTransaction.date.desc())
    )
    return result.all()


@router.post("/{portfolio_id}/assets/{asset_id}/operations", response_model=OperationOut, status_code=status.HTTP_201_CREATED)
async def add_operation(
    request: Request, portfolio_id: int, asset_id: int,
    body: OperationCreate, db: DB, user: CurrentUser, tenant_id: TenantID
):
    await _get_asset_or_404(db, asset_id, portfolio_id, tenant_id)
    total = (body.quantity * body.unit_price).quantize(Decimal("0.01"))
    op = InvestmentTransaction(
        **body.model_dump(),
        total_amount=total,
        asset_id=asset_id,
        portfolio_id=portfolio_id,
        tenant_id=tenant_id,
        created_by=user.id,
    )
    db.add(op)
    await db.flush()
    await audit(db, "operation.create", user_id=user.id, tenant_id=tenant_id,
                entity="operation", entity_id=op.id,
                payload={"type": body.type, "ticker": (await db.get(Asset, asset_id)).ticker,
                         "qty": str(body.quantity), "price": str(body.unit_price)},
                ip=client_ip(request))
    await db.commit()
    await db.refresh(op)
    return op


@router.delete("/{portfolio_id}/assets/{asset_id}/operations/{op_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_operation(
    request: Request, portfolio_id: int, asset_id: int, op_id: int,
    db: DB, user: CurrentUser, tenant_id: TenantID
):
    op = await db.get(InvestmentTransaction, op_id)
    if not op or op.asset_id != asset_id or op.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Operation not found")
    await audit(db, "operation.delete", user_id=user.id, tenant_id=tenant_id,
                entity="operation", entity_id=op_id,
                payload={"type": op.type}, ip=client_ip(request))
    await db.delete(op)
    await db.commit()


# ── Dividends ─────────────────────────────────────────────────────────────────

@router.get("/{portfolio_id}/dividends", response_model=list[DividendOut])
async def list_dividends(portfolio_id: int, db: DB, tenant_id: TenantID):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)
    result = await db.scalars(
        select(Dividend)
        .where(Dividend.portfolio_id == portfolio_id)
        .order_by(Dividend.date.desc())
    )
    return result.all()


@router.post("/{portfolio_id}/assets/{asset_id}/dividends", response_model=DividendOut, status_code=status.HTTP_201_CREATED)
async def add_dividend(
    request: Request, portfolio_id: int, asset_id: int,
    body: DividendCreate, db: DB, user: CurrentUser, tenant_id: TenantID
):
    await _get_asset_or_404(db, asset_id, portfolio_id, tenant_id)
    div = Dividend(
        **body.model_dump(),
        asset_id=asset_id,
        portfolio_id=portfolio_id,
        tenant_id=tenant_id,
        created_by=user.id,
    )
    db.add(div)
    await db.flush()
    await audit(db, "dividend.create", user_id=user.id, tenant_id=tenant_id,
                entity="dividend", entity_id=div.id,
                payload={"amount": str(body.amount), "date": str(body.date)}, ip=client_ip(request))
    await db.commit()
    await db.refresh(div)
    return div


@router.delete("/{portfolio_id}/dividends/{div_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dividend(
    request: Request, portfolio_id: int, div_id: int,
    db: DB, user: CurrentUser, tenant_id: TenantID
):
    div = await db.get(Dividend, div_id)
    if not div or div.portfolio_id != portfolio_id or div.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dividend not found")
    await audit(db, "dividend.delete", user_id=user.id, tenant_id=tenant_id,
                entity="dividend", entity_id=div_id,
                payload={"amount": str(div.amount)}, ip=client_ip(request))
    await db.delete(div)
    await db.commit()


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_portfolio_or_404(db, portfolio_id: int, tenant_id: int) -> Portfolio:
    p = await db.get(Portfolio, portfolio_id)
    if not p or p.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Portfolio not found")
    return p


async def _get_asset_or_404(db, asset_id: int, portfolio_id: int, tenant_id: int) -> Asset:
    a = await db.get(Asset, asset_id)
    if not a or a.portfolio_id != portfolio_id or a.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    return a
