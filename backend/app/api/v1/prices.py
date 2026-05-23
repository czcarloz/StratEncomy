"""Proxy de cotações via yfinance (Yahoo Finance) + cálculo BCB para Tesouro Direto."""
from __future__ import annotations

import re
from datetime import date, datetime
from math import ceil

import httpx
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

router = APIRouter(prefix="/prices", tags=["prices"])


class TickerPrice(BaseModel):
    symbol: str
    price: float
    change_percent: float
    estimated: bool = False  # True = preço calculado (Tesouro), não cotação de mercado


# Criptos: Yahoo Finance só tem cotação em USD (ex: BTC-USD). Convertemos para BRL no fetch.
_CRYPTO_TICKERS = {"BTC", "ETH", "SOL", "BNB", "ADA", "DOT", "AVAX", "MATIC", "LINK", "XRP", "LTC", "DOGE"}

# BCB SGS séries para taxa LTN (Tesouro Prefixado)
# 226 = LTN ~1 ano (252 du)  |  227 = LTN ~2 anos (504 du)
_BCB_LTN_SERIES = {252: "226", 504: "227"}


def _to_yf(ticker: str) -> str:
    """PETR4 → PETR4.SA  |  BTC → BTC-USD (convertido p/ BRL)  |  IVV → IVV (NYSE)"""
    t = ticker.upper().strip()
    if not t or t.startswith("TESOURO"):
        return ""
    if "=" in t or "." in t or "-" in t:
        return t
    if t in _CRYPTO_TICKERS:
        return f"{t}-USD"
    if re.fullmatch(r"[A-Z]{2,5}", t):
        return t  # mercado americano
    return f"{t}.SA"   # B3


def _business_days(d1: date, d2: date) -> int:
    """Estimativa de dias úteis entre duas datas (252 du/ano)."""
    return ceil((d2 - d1).days * 252 / 365)


def _bcb_rate(series: str) -> float | None:
    """Busca taxa anual de uma série SGS do BCB."""
    try:
        url = f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series}/dados/ultimos/1?formato=json"
        r = httpx.get(url, timeout=8)
        return float(r.json()[0]["valor"])
    except Exception:
        return None


def _fetch_tesouro_prefixado_sync(tickers: list[str]) -> list[TickerPrice]:
    """
    Calcula PU estimado para Tesouro Prefixado usando taxa LTN do BCB.
    Fórmula: PU = 1000 / (1 + taxa)^(du/252)
    Margem de erro: ~3–7% vs preço oficial ANBIMA.
    """
    results: list[TickerPrice] = []
    hoje = date.today()

    # Busca taxas para 252 du e 504 du (interpolação linear)
    taxa_252 = _bcb_rate("226")
    taxa_504 = _bcb_rate("227")

    if taxa_252 is None:
        return results

    for ticker in tickers:
        m = re.search(r"\b(20\d{2})\b", ticker)
        if not m:
            continue
        year = int(m.group(1))
        maturity = date(year, 1, 1)
        if maturity <= hoje:
            continue

        du = _business_days(hoje, maturity)

        # Interpolação entre 252 e 504 du se ambas as taxas disponíveis
        if taxa_504 and taxa_504 > 0.01 and 252 < du <= 504:
            frac = (du - 252) / (504 - 252)
            taxa = taxa_252 + frac * (taxa_504 - taxa_252)
        else:
            taxa = taxa_252

        pu = 1000 / (1 + taxa) ** (du / 252)

        results.append(TickerPrice(
            symbol=ticker,
            price=round(pu, 2),
            change_percent=0.0,
            estimated=True,
        ))

    return results


def _fetch_sync(yf_symbols: list[str], orig_map: dict[str, str]) -> list[TickerPrice]:
    """Executa em thread pool — yfinance é síncrono.
    Tickers *-USD (crypto) têm preço convertido para BRL via USDBRL=X."""
    results: list[TickerPrice] = []

    usd_brl: float | None = None
    if any(s.endswith("-USD") for s in yf_symbols):
        usd_brl = _fetch_usdbrl_sync()

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
                if yf_sym.endswith("-USD") and usd_brl:
                    price = price * usd_brl
                    prev  = prev * usd_brl if prev else None
                change = ((price / prev) - 1) * 100 if prev and prev > 0 else 0.0
                results.append(TickerPrice(symbol=orig, price=float(price), change_percent=round(float(change), 2)))
            except Exception:
                continue
    except Exception:
        pass
    return results


def _fetch_usdbrl_sync() -> float | None:
    try:
        t = yf.Ticker("USDBRL=X")
        fi = t.fast_info
        price = getattr(fi, "last_price", None)
        return float(price) if price else None
    except Exception:
        return None


@router.get("", response_model=list[TickerPrice])
async def get_prices(tickers: str = Query(..., description="Tickers separados por vírgula, ex: PETR4,ITSA4,IVV,BTC")):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(400, "Informe pelo menos um ticker")

    # Separa Tesouro Prefixado dos demais
    tesouro_pref = [t for t in ticker_list if t.startswith("TESOURO PREFIXADO")]
    outros       = [t for t in ticker_list if not t.startswith("TESOURO")]

    orig_map = {_to_yf(t): t for t in outros if _to_yf(t)}

    results: list[TickerPrice] = []
    if orig_map:
        results += await run_in_threadpool(_fetch_sync, list(orig_map.keys()), orig_map)
    if tesouro_pref:
        results += await run_in_threadpool(_fetch_tesouro_prefixado_sync, tesouro_pref)

    return results


@router.get("/usdbrl", response_model=TickerPrice)
async def get_usdbrl():
    price = await run_in_threadpool(_fetch_usdbrl_sync)
    if price is None:
        raise HTTPException(503, "Cotação USD/BRL indisponível no momento")
    return TickerPrice(symbol="USDBRL", price=price, change_percent=0.0)
