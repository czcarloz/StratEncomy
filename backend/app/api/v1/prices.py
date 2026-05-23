"""Proxy de cotações via yfinance (Yahoo Finance) — sem token, sem CORS."""
from __future__ import annotations

import yfinance as yf
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

router = APIRouter(prefix="/prices", tags=["prices"])


class TickerPrice(BaseModel):
    symbol: str
    price: float
    change_percent: float


def _to_yf(ticker: str) -> str:
    """PETR4 → PETR4.SA  (Yahoo Finance usa sufixo .SA para B3)"""
    t = ticker.upper().strip()
    if not t or t.startswith("TESOURO"):
        return ""
    return f"{t}.SA"


def _fetch_sync(yf_symbols: list[str], orig_map: dict[str, str]) -> list[TickerPrice]:
    """Executa em thread pool — yfinance é síncrono."""
    results: list[TickerPrice] = []
    try:
        tkrs = yf.Tickers(" ".join(yf_symbols))
        for yf_sym, ticker_obj in tkrs.tickers.items():
            orig = orig_map.get(yf_sym)
            if not orig:
                continue
            try:
                fi = ticker_obj.fast_info
                price = getattr(fi, "last_price", None)
                prev  = getattr(fi, "previous_close", None)
                if price is None:
                    continue
                change = ((price / prev) - 1) * 100 if prev and prev > 0 else 0.0
                results.append(TickerPrice(symbol=orig, price=float(price), change_percent=round(float(change), 2)))
            except Exception:
                continue
    except Exception:
        pass
    return results


@router.get("", response_model=list[TickerPrice])
async def get_prices(tickers: str = Query(..., description="Tickers separados por vírgula, ex: PETR4,ITSA4")):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(400, "Informe pelo menos um ticker")

    # mapeia PETR4.SA → PETR4 para recolocar o ticker original na resposta
    orig_map = {_to_yf(t): t for t in ticker_list if _to_yf(t)}
    if not orig_map:
        return []

    return await run_in_threadpool(_fetch_sync, list(orig_map.keys()), orig_map)
