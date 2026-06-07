import calendar as cal_mod
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.api.v1.prices import _to_yf
from app.core.deps import AdminUser, CurrentUser, DB, TenantID
from app.models.portfolio import Asset, Dividend, InvestmentTransaction, OperationType, Portfolio
from app.schemas.portfolio import (
    AssetCreate,
    AssetOut,
    AssetUpdate,
    AssetPosition,
    DividendCreate,
    DividendOut,
    MonthlyInvestmentPoint,
    OperationCreate,
    OperationOut,
    OperationUpdate,
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
async def create_portfolio(request: Request, body: PortfolioCreate, db: DB, user: AdminUser, tenant_id: TenantID):
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
async def update_portfolio(request: Request, portfolio_id: int, body: PortfolioUpdate, db: DB, user: AdminUser, tenant_id: TenantID):
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
async def delete_portfolio(request: Request, portfolio_id: int, db: DB, user: AdminUser, tenant_id: TenantID):
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
                currency=asset.currency,
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


# ── Portfolio history ─────────────────────────────────────────────────────────

def _fetch_monthly_prices_sync(
    sym_to_aid: dict[str, int],
    start: date,
    end: date,
) -> dict[int, dict[tuple[int, int], float]]:
    """Busca preços de fechamento mensais via yfinance para cada ativo."""
    import yfinance as yf

    result: dict[int, dict[tuple[int, int], float]] = {aid: {} for aid in sym_to_aid.values()}
    if not sym_to_aid:
        return result

    end_dt = date(end.year, end.month, 1) + timedelta(days=35)
    symbols = list(sym_to_aid.keys())

    try:
        tkrs = yf.Tickers(" ".join(symbols))
        for sym, ticker_obj in tkrs.tickers.items():
            aid = sym_to_aid.get(sym)
            if aid is None:
                continue
            try:
                hist = ticker_obj.history(
                    start=start.strftime("%Y-%m-%d"),
                    end=end_dt.strftime("%Y-%m-%d"),
                    interval="1mo",
                )
                for idx, row in hist.iterrows():
                    price = row.get("Close")
                    if price is not None and price == price:  # não-NaN
                        result[aid][(idx.year, idx.month)] = float(price)
            except Exception:
                continue
    except Exception:
        pass

    return result


@router.get("/{portfolio_id}/history", response_model=list[MonthlyInvestmentPoint])
async def get_portfolio_history(
    portfolio_id: int, db: DB, tenant_id: TenantID,
    year: int | None = Query(None),
    usd_brl: float = Query(1.0),
):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)

    assets = (await db.scalars(
        select(Asset).where(Asset.portfolio_id == portfolio_id)
    )).all()
    asset_map = {a.id: a for a in assets}

    all_ops = (await db.scalars(
        select(InvestmentTransaction)
        .where(InvestmentTransaction.portfolio_id == portfolio_id)
        .order_by(InvestmentTransaction.date)
    )).all()

    if not all_ops:
        return []

    usd_rate = Decimal(str(usd_brl))
    first_date = min(op.date for op in all_ops)
    today = date.today()

    # Meses da timeline
    months: list[tuple[int, int]] = []
    y, m = first_date.year, first_date.month
    while (y, m) <= (today.year, today.month):
        months.append((y, m))
        m += 1
        if m > 12:
            m, y = 1, y + 1

    # Operações por ativo
    ops_by_asset: dict[int, list] = {a.id: [] for a in assets}
    for op in all_ops:
        if op.asset_id in ops_by_asset:
            ops_by_asset[op.asset_id].append(op)

    # Quantidade mantida por ativo em cada mês (incremental)
    asset_qty_history: dict[int, dict[tuple[int, int], Decimal]] = {}
    for asset in assets:
        qty = Decimal("0")
        ops_sorted = sorted(ops_by_asset[asset.id], key=lambda o: o.date)
        op_idx = 0
        qty_hist: dict[tuple[int, int], Decimal] = {}
        for (ym_y, ym_m) in months:
            last_day = date(ym_y, ym_m, cal_mod.monthrange(ym_y, ym_m)[1])
            while op_idx < len(ops_sorted) and ops_sorted[op_idx].date <= last_day:
                op = ops_sorted[op_idx]
                if op.type == OperationType.buy:
                    qty += op.quantity
                else:
                    qty = max(Decimal("0"), qty - op.quantity)
                op_idx += 1
            qty_hist[(ym_y, ym_m)] = qty
        asset_qty_history[asset.id] = qty_hist

    # Preços históricos mensais via yfinance
    sym_to_aid: dict[str, int] = {}
    for asset in assets:
        sym = _to_yf(asset.ticker)
        if sym:
            sym_to_aid[sym] = asset.id

    price_history: dict[int, dict[tuple[int, int], float]] = {}
    if sym_to_aid:
        price_history = await run_in_threadpool(
            _fetch_monthly_prices_sync, sym_to_aid, first_date, today
        )

    # Custo acumulado por mês
    monthly_cost_delta: dict[tuple[int, int], Decimal] = defaultdict(Decimal)
    for op in all_ops:
        ym = (op.date.year, op.date.month)
        a = asset_map.get(op.asset_id)
        rate = usd_rate if (a and a.currency == "USD") else Decimal("1")
        amt = (op.total_amount * rate).quantize(Decimal("0.01"))
        if op.type == OperationType.buy:
            monthly_cost_delta[ym] += amt
        else:
            monthly_cost_delta[ym] -= amt

    results: list[MonthlyInvestmentPoint] = []
    cumulative_cost = Decimal("0")

    for (ym_y, ym_m) in months:
        cumulative_cost += monthly_cost_delta.get((ym_y, ym_m), Decimal("0"))

        # Valor a mercado: qty × preço mensal para cada ativo
        market_value = Decimal("0")
        for asset in assets:
            qty = asset_qty_history[asset.id].get((ym_y, ym_m), Decimal("0"))
            if qty <= 0:
                continue
            rate = usd_rate if asset.currency == "USD" else Decimal("1")

            if asset.id in price_history and (ym_y, ym_m) in price_history[asset.id]:
                price = Decimal(str(price_history[asset.id][(ym_y, ym_m)]))
                market_value += (qty * price * rate).quantize(Decimal("0.01"))
            else:
                # Fallback: usa custo histórico do ativo naquele mês
                ops_sorted = sorted(ops_by_asset[asset.id], key=lambda o: o.date)
                last_day = date(ym_y, ym_m, cal_mod.monthrange(ym_y, ym_m)[1])
                held, cost = Decimal("0"), Decimal("0")
                for op in ops_sorted:
                    if op.date > last_day:
                        break
                    if op.type == OperationType.buy:
                        held += op.quantity
                        cost += op.quantity * op.unit_price
                    else:
                        if held > 0:
                            avg = cost / held
                            cost -= op.quantity * avg
                            held = max(Decimal("0"), held - op.quantity)
                market_value += (cost * rate).quantize(Decimal("0.01"))

        if year is None or ym_y == year:
            results.append(MonthlyInvestmentPoint(
                year=ym_y, month=ym_m,
                total_invested=cumulative_cost.quantize(Decimal("0.01")),
                market_value=market_value.quantize(Decimal("0.01")),
            ))

    return results


# ── Assets ────────────────────────────────────────────────────────────────────

@router.get("/{portfolio_id}/assets", response_model=list[AssetOut])
async def list_assets(portfolio_id: int, db: DB, tenant_id: TenantID):
    await _get_portfolio_or_404(db, portfolio_id, tenant_id)
    result = await db.scalars(
        select(Asset).where(Asset.portfolio_id == portfolio_id).order_by(Asset.ticker)
    )
    return result.all()


@router.post("/{portfolio_id}/assets", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
async def add_asset(request: Request, portfolio_id: int, body: AssetCreate, db: DB, user: AdminUser, tenant_id: TenantID):
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


@router.patch("/{portfolio_id}/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    request: Request, portfolio_id: int, asset_id: int,
    body: AssetUpdate, db: DB, user: AdminUser, tenant_id: TenantID,
):
    asset = await _get_asset_or_404(db, asset_id, portfolio_id, tenant_id)
    if body.name is not None:
        asset.name = body.name
    if body.asset_class is not None:
        asset.asset_class = body.asset_class
    if body.currency is not None:
        asset.currency = body.currency
    await audit(db, "asset.update", user_id=user.id, tenant_id=tenant_id,
                entity="asset", entity_id=asset_id,
                payload=body.model_dump(exclude_none=True), ip=client_ip(request))
    await db.commit()
    await db.refresh(asset)
    return asset


@router.delete("/{portfolio_id}/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(request: Request, portfolio_id: int, asset_id: int, db: DB, user: AdminUser, tenant_id: TenantID):
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
    body: OperationCreate, db: DB, user: AdminUser, tenant_id: TenantID
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


@router.patch("/{portfolio_id}/assets/{asset_id}/operations/{op_id}", response_model=OperationOut)
async def update_operation(
    request: Request, portfolio_id: int, asset_id: int, op_id: int,
    body: OperationUpdate, db: DB, user: AdminUser, tenant_id: TenantID,
):
    op = await db.get(InvestmentTransaction, op_id)
    if not op or op.asset_id != asset_id or op.tenant_id != tenant_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Operation not found")
    data = body.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(op, k, v)
    if "quantity" in data or "unit_price" in data:
        op.total_amount = (op.quantity * op.unit_price).quantize(Decimal("0.01"))
    await audit(db, "operation.update", user_id=user.id, tenant_id=tenant_id,
                entity="operation", entity_id=op_id,
                payload={k: str(v) for k, v in data.items()}, ip=client_ip(request))
    await db.commit()
    await db.refresh(op)
    return op


@router.delete("/{portfolio_id}/assets/{asset_id}/operations/{op_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_operation(
    request: Request, portfolio_id: int, asset_id: int, op_id: int,
    db: DB, user: AdminUser, tenant_id: TenantID
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
    body: DividendCreate, db: DB, user: AdminUser, tenant_id: TenantID
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
    db: DB, user: AdminUser, tenant_id: TenantID
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
