"""Parse B3 'Extrato de Movimentações' Excel files."""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation

import openpyxl

# Movement types that map to buy/sell operations
_OP_TYPES = {"Transferência - Liquidação", "Compra", "Venda"}

# Movement types that map to dividends
_DIV_TYPES = {"Rendimento", "Juros Sobre Capital Próprio", "Dividendo"}


@dataclass
class ParsedOperation:
    ticker: str
    op_type: str        # "buy" | "sell"
    quantity: str
    unit_price: str
    date: str           # YYYY-MM-DD
    broker: str | None


@dataclass
class ParsedDividend:
    ticker: str
    amount: str
    date: str           # YYYY-MM-DD
    note: str | None


@dataclass
class SkippedRow:
    row_num: int
    reason: str
    movimentacao: str | None


@dataclass
class B3ParseResult:
    operations: list[ParsedOperation] = field(default_factory=list)
    dividends: list[ParsedDividend] = field(default_factory=list)
    skipped: list[SkippedRow] = field(default_factory=list)


def _parse_date(val: str) -> str:
    """DD/MM/YYYY → YYYY-MM-DD"""
    return datetime.strptime(str(val).strip(), "%d/%m/%Y").strftime("%Y-%m-%d")


def _extract_ticker(produto: str) -> str:
    return str(produto).split(" - ")[0].strip()


def _parse_decimal(val: object) -> Decimal | None:
    if val is None:
        return None
    s = str(val).strip()
    if s in ("-", "", "None"):
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _abbreviate_broker(name: str) -> str:
    """'XP INVESTIMENTOS CCTVM S/A' → 'XP'"""
    parts = str(name).strip().split()
    return parts[0] if parts else str(name)


def _guess_asset_class(ticker: str) -> str:
    """Best-effort heuristic — user can change after import."""
    t = ticker.upper()
    if t.endswith("11"):
        return "fii"
    if t.endswith(("3", "4", "5", "6", "7", "8")):
        return "stock"
    return "stock"


def parse_b3_xlsx(file_bytes: bytes) -> B3ParseResult:
    result = B3ParseResult()

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)

    if "Movimentação" not in wb.sheetnames:
        raise ValueError(
            "Planilha 'Movimentação' não encontrada. "
            "Faça o download do Extrato de Movimentações em investidor.b3.com.br."
        )

    ws = wb["Movimentação"]

    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not row or not row[0]:
            continue

        entrada_saida = str(row[0]).strip() if row[0] else ""
        data          = str(row[1]).strip() if row[1] else ""
        movimentacao  = str(row[2]).strip() if row[2] else ""
        produto       = str(row[3]).strip() if row[3] else ""
        instituicao   = str(row[4]).strip() if row[4] else ""
        quantidade    = row[5]
        preco_unit    = row[6]
        valor_op      = row[7]

        if not movimentacao or not produto:
            continue

        if movimentacao in _OP_TYPES:
            price = _parse_decimal(preco_unit)
            qty   = _parse_decimal(quantidade)
            if price is None or price <= 0:
                result.skipped.append(SkippedRow(i, "Preço unitário ausente", movimentacao))
                continue
            if qty is None or qty <= 0:
                result.skipped.append(SkippedRow(i, "Quantidade inválida", movimentacao))
                continue

            if movimentacao == "Venda" or (
                movimentacao == "Transferência - Liquidação" and entrada_saida == "Debito"
            ):
                op_type = "sell"
            else:
                op_type = "buy"

            result.operations.append(ParsedOperation(
                ticker=_extract_ticker(produto),
                op_type=op_type,
                quantity=str(qty),
                unit_price=str(price),
                date=_parse_date(data),
                broker=_abbreviate_broker(instituicao) if instituicao else None,
            ))

        elif movimentacao in _DIV_TYPES:
            amount = _parse_decimal(valor_op)
            if amount is None or amount <= 0:
                result.skipped.append(SkippedRow(i, "Valor ausente ou zero", movimentacao))
                continue

            result.dividends.append(ParsedDividend(
                ticker=_extract_ticker(produto),
                amount=str(amount),
                date=_parse_date(data),
                note=movimentacao if movimentacao != "Rendimento" else None,
            ))

        else:
            result.skipped.append(SkippedRow(i, "Tipo ignorado", movimentacao))

    return result
