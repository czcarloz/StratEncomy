"""Proxy de cotações via brapi.dev — evita CORS no frontend."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/prices", tags=["prices"])

BRAPI_URL = "https://brapi.dev/api/quote/{tickers}"


class TickerPrice(BaseModel):
    symbol: str
    price: float
    change_percent: float


@router.get("", response_model=list[TickerPrice])
async def get_prices(tickers: str = Query(..., description="Comma-separated tickers, e.g. PETR4,ITSA4")):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(400, "Informe pelo menos um ticker")

    # Tesouro Direto e similares não têm cotação na brapi — filtrar
    fetchable = [t for t in ticker_list if not t.startswith("TESOURO")]
    if not fetchable:
        return []

    url = BRAPI_URL.format(tickers=",".join(fetchable))
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []  # falha silenciosa — frontend exibe "—"

    results: list[TickerPrice] = []
    for item in data.get("results", []):
        price = item.get("regularMarketPrice")
        if price is None:
            continue
        results.append(TickerPrice(
            symbol=item["symbol"],
            price=float(price),
            change_percent=float(item.get("regularMarketChangePercent") or 0),
        ))
    return results
