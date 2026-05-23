"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, ArrowUpCircle, ArrowDownCircle,
  Gift, ChevronDown, ChevronRight, Upload, RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Asset, AssetPosition, Dividend, Operation, PortfolioPosition } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { B3ImportModal } from "./import-modal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ASSET_CLASS_OPTIONS = [
  { value: "stock",  label: "Stock (Ação)" },
  { value: "fii",    label: "FII" },
  { value: "etf",    label: "ETF" },
  { value: "bdr",    label: "BDR" },
  { value: "bond",   label: "Renda Fixa" },
  { value: "crypto", label: "Crypto" },
  { value: "other",  label: "Outro" },
];

const CLASS_BADGE: Record<string, string> = {
  stock:  "bg-primary-bg text-primary",
  fii:    "bg-info-bg text-info",
  etf:    "bg-primary-bg text-primary",
  bdr:    "bg-surface text-muted",
  bond:   "bg-primary-bg text-success",
  crypto: "bg-info-bg text-info",
  other:  "bg-surface text-muted",
};

function fmt(v: string | number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function fmtQty(v: string) {
  const n = Number(v);
  return n % 1 === 0
    ? n.toLocaleString("pt-BR")
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

function gainColor(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted";
}

// ── Price fetching via brapi.dev ──────────────────────────────────────────────

interface PriceData { price: number; changePercent: number }

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchPrices(tickers: string[]): Promise<Record<string, PriceData>> {
  if (tickers.length === 0) return {};
  try {
    const res = await fetch(`${BASE}/api/v1/prices?tickers=${tickers.join(",")}`);
    if (!res.ok) return {};
    const data: { symbol: string; price: number; change_percent: number }[] = await res.json();
    const out: Record<string, PriceData> = {};
    data.forEach(r => { out[r.symbol] = { price: r.price, changePercent: r.change_percent }; });
    return out;
  } catch {
    return {};
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetRow {
  asset: Asset;
  pos: AssetPosition;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const portfolioId = Number(id);

  const [assets, setAssets]     = useState<Asset[]>([]);
  const [position, setPosition] = useState<PortfolioPosition | null>(null);
  const [loading, setLoading]   = useState(true);
  const [prices, setPrices]     = useState<Record<string, PriceData>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesUpdated, setPricesUpdated] = useState<Date | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [assetOps, setAssetOps]   = useState<Record<number, Operation[]>>({});
  const [assetDivs, setAssetDivs] = useState<Record<number, Dividend[]>>({});

  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showImport, setShowImport]     = useState(false);
  const [showAddOp, setShowAddOp]       = useState<Asset | null>(null);
  const [showAddDiv, setShowAddDiv]     = useState<Asset | null>(null);

  const [ticker, setTicker]       = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetClass, setAssetClass] = useState("stock");
  const [opType, setOpType]       = useState("buy");
  const [qty, setQty]             = useState("");
  const [price, setPrice]         = useState("");
  const [opDate, setOpDate]       = useState(new Date().toISOString().slice(0, 10));
  const [broker, setBroker]       = useState("");
  const [divAmount, setDivAmount] = useState("");
  const [divDate, setDivDate]     = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        api.portfolios.assets(portfolioId),
        api.portfolios.position(portfolioId).catch(() => null),
      ]);
      setAssets(a);
      setPosition(p);
    } catch {
      setAssets([]); setPosition(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  const loadPrices = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setPricesLoading(true);
    const data = await fetchPrices(tickers);
    setPrices(data);
    setPricesUpdated(new Date());
    setPricesLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build rows: only assets with an active position (qty > 0)
  const posMap: Record<number, AssetPosition> = {};
  position?.positions.forEach((p) => { posMap[p.asset_id] = p; });

  const rows: AssetRow[] = assets
    .filter(a => {
      const p = posMap[a.id];
      return p && Number(p.quantity) > 0;
    })
    .map(a => ({ asset: a, pos: posMap[a.id] }));

  useEffect(() => {
    if (rows.length > 0) {
      loadPrices(rows.map(r => r.asset.ticker));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, position]);

  // ── Portfolio summary ──────────────────────────────────────────────────────

  let totalInvested = 0;
  let totalMarket   = 0;
  let totalDivs     = 0;
  let pricedCount   = 0;

  rows.forEach(({ pos, asset }) => {
    const q  = Number(pos.quantity);
    const pm = Number(pos.avg_price);
    totalInvested += q * pm;
    totalDivs     += Number(pos.total_dividends);
    const p = prices[asset.ticker];
    if (p) { totalMarket += q * p.price; pricedCount++; }
    else    { totalMarket += q * pm; } // fallback to cost for unpriced
  });

  const totalGain    = totalMarket - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const totalReturn  = totalGain + totalDivs;
  const totalRetPct  = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function toggleAsset(assetId: number) {
    if (expandedId === assetId) { setExpandedId(null); return; }
    setExpandedId(assetId);
    if (!assetOps[assetId]) {
      try {
        const [ops, divs] = await Promise.all([
          api.portfolios.operations(portfolioId, assetId),
          api.portfolios.dividends(portfolioId),
        ]);
        setAssetOps(prev => ({ ...prev, [assetId]: ops }));
        setAssetDivs(prev => ({ ...prev, [assetId]: divs.filter(d => d.asset_id === assetId) }));
      } catch { /* leave empty */ }
    }
  }

  async function handleDeleteAsset(assetId: number) {
    if (!confirm("Remover este ativo e todas as suas operações?")) return;
    try {
      await api.portfolios.removeAsset(portfolioId, assetId);
      toast.success("Ativo removido");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  async function handleAddAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;
    setSaving(true);
    try {
      await api.portfolios.addAsset(portfolioId, {
        ticker: ticker.trim().toUpperCase(),
        name: assetName.trim() || undefined,
        asset_class: assetClass,
      });
      toast.success("Ativo adicionado");
      setShowAddAsset(false);
      setTicker(""); setAssetName(""); setAssetClass("stock");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar");
    } finally { setSaving(false); }
  }

  async function handleAddOp(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddOp) return;
    setSaving(true);
    try {
      await api.portfolios.addOperation(portfolioId, showAddOp.id, {
        type: opType, quantity: qty, unit_price: price,
        date: opDate, broker: broker.trim() || undefined,
      });
      toast.success("Operação registrada");
      const assetId = showAddOp.id;
      setShowAddOp(null); setQty(""); setPrice(""); setBroker("");
      setAssetOps(prev => ({ ...prev, [assetId]: [] }));
      setExpandedId(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar");
    } finally { setSaving(false); }
  }

  async function handleAddDiv(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddDiv) return;
    setSaving(true);
    try {
      await api.portfolios.addDividend(portfolioId, showAddDiv.id, { amount: divAmount, date: divDate });
      toast.success("Dividendo registrado");
      const assetId = showAddDiv.id;
      setShowAddDiv(null); setDivAmount("");
      setAssetDivs(prev => ({ ...prev, [assetId]: [] }));
      setExpandedId(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar");
    } finally { setSaving(false); }
  }

  async function handleDeleteOp(assetId: number, opId: number) {
    try {
      await api.portfolios.removeOperation(portfolioId, assetId, opId);
      setAssetOps(prev => ({ ...prev, [assetId]: prev[assetId]?.filter(o => o.id !== opId) ?? [] }));
      await load(); toast.success("Operação removida");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro"); }
  }

  async function handleDeleteDiv(assetId: number, divId: number) {
    try {
      await api.portfolios.removeDividend(portfolioId, divId);
      setAssetDivs(prev => ({ ...prev, [assetId]: prev[assetId]?.filter(d => d.id !== divId) ?? [] }));
      await load(); toast.success("Dividendo removido");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Erro"); }
  }

  const title = position?.name ?? "Portfolio";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={title}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}>
              <Upload size={14} className="mr-1.5" />Importar B3
            </Button>
            <Button size="sm" onClick={() => setShowAddAsset(true)}>
              <Plus size={14} className="mr-1.5" />Add Ativo
            </Button>
          </div>
        }
      />

      <div className="flex flex-col flex-1 overflow-auto px-6 py-5 gap-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryCard label="Total Investido"   value={fmt(totalInvested)} />
              <SummaryCard label="Valor de Mercado"  value={fmt(totalMarket)}   loading={pricesLoading} />
              <SummaryCard
                label="Resultado"
                value={fmt(totalGain)}
                sub={fmtPct(totalGainPct)}
                color={gainColor(totalGain)}
                loading={pricesLoading}
              />
              <SummaryCard label="Dividendos" value={fmt(totalDivs)} color="text-success" />
              <SummaryCard
                label="Retorno Total"
                value={fmt(totalReturn)}
                sub={fmtPct(totalRetPct)}
                color={gainColor(totalReturn)}
                loading={pricesLoading}
              />
            </div>

            {/* ── Price status ── */}
            <div className="flex items-center gap-2 text-xs text-muted -mt-2">
              {pricesLoading && <Spinner className="h-3 w-3" />}
              {pricesUpdated && !pricesLoading && (
                <>
                  <span>
                    Preços via brapi.dev · atualizado às{" "}
                    {pricesUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {pricedCount < rows.length && ` · ${rows.length - pricedCount} ativo(s) sem cotação`}
                  </span>
                  <button
                    onClick={() => loadPrices(rows.map(r => r.asset.ticker))}
                    className="ml-1 hover:text-text transition-colors"
                    title="Atualizar cotações"
                  >
                    <RefreshCw size={11} />
                  </button>
                </>
              )}
            </div>

            {/* ── Positions table ── */}
            {rows.length === 0 ? (
              <p className="text-sm text-muted">
                Nenhuma posição ativa. Importe seu extrato da B3 ou adicione um ativo manualmente.
              </p>
            ) : (
              <div className="rounded-card border border-border overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                      <th className="px-4 py-2.5 font-medium">Ativo</th>
                      <th className="px-4 py-2.5 font-medium text-right">Qtd</th>
                      <th className="px-4 py-2.5 font-medium text-right">PM</th>
                      <th className="px-4 py-2.5 font-medium text-right">Preço Atual</th>
                      <th className="px-4 py-2.5 font-medium text-right">Var. Dia</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total Investido</th>
                      <th className="px-4 py-2.5 font-medium text-right">Valor Atual</th>
                      <th className="px-4 py-2.5 font-medium text-right">Resultado R$</th>
                      <th className="px-4 py-2.5 font-medium text-right">Rent.</th>
                      <th className="px-4 py-2.5 font-medium text-right">Dividendos</th>
                      <th className="px-4 py-2.5 font-medium text-right">Ret. Total</th>
                      <th className="px-4 py-2.5 font-medium w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ asset, pos }) => {
                      const q  = Number(pos.quantity);
                      const pm = Number(pos.avg_price);
                      const pd = prices[asset.ticker];
                      const currentPrice  = pd?.price ?? null;
                      const invested      = q * pm;
                      const marketVal     = currentPrice !== null ? q * currentPrice : null;
                      const gainR         = marketVal !== null ? marketVal - invested : null;
                      const gainPct       = gainR !== null && invested > 0 ? (gainR / invested) * 100 : null;
                      const divs          = Number(pos.total_dividends);
                      const retTotal      = gainR !== null ? gainR + divs : null;
                      const retTotalPct   = retTotal !== null && invested > 0 ? (retTotal / invested) * 100 : null;

                      return (
                        <>
                          <tr
                            key={asset.id}
                            className="border-b border-border last:border-0 hover:bg-surface/60 cursor-pointer transition-colors"
                            onClick={() => toggleAsset(asset.id)}
                          >
                            {/* Ativo */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {expandedId === asset.id
                                  ? <ChevronDown size={13} className="text-muted shrink-0" />
                                  : <ChevronRight size={13} className="text-muted shrink-0" />}
                                <span className="font-semibold text-text">{asset.ticker}</span>
                                {asset.name && <span className="text-xs text-muted hidden lg:inline">{asset.name}</span>}
                                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${CLASS_BADGE[asset.asset_class] ?? "bg-surface text-muted"}`}>
                                  {asset.asset_class.toUpperCase()}
                                </span>
                              </div>
                            </td>

                            {/* Qtd */}
                            <td className="px-4 py-3 text-right font-mono text-xs">{fmtQty(pos.quantity)}</td>

                            {/* PM */}
                            <td className="px-4 py-3 text-right font-mono text-xs text-muted">{fmt(pm)}</td>

                            {/* Preço Atual */}
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {pricesLoading
                                ? <span className="text-muted">…</span>
                                : currentPrice !== null
                                  ? <span className="font-medium text-text">{fmt(currentPrice)}</span>
                                  : <span className="text-muted">—</span>}
                            </td>

                            {/* Var. Dia */}
                            <td className="px-4 py-3 text-right text-xs">
                              {pd
                                ? <span className={`font-medium ${gainColor(pd.changePercent)}`}>
                                    {fmtPct(pd.changePercent)}
                                  </span>
                                : <span className="text-muted">—</span>}
                            </td>

                            {/* Total Investido */}
                            <td className="px-4 py-3 text-right font-mono text-xs text-muted">{fmt(invested)}</td>

                            {/* Valor Atual */}
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {marketVal !== null
                                ? <span className="font-medium text-text">{fmt(marketVal)}</span>
                                : <span className="text-muted">—</span>}
                            </td>

                            {/* Resultado R$ */}
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {gainR !== null
                                ? <span className={`font-semibold ${gainColor(gainR)}`}>{fmt(gainR)}</span>
                                : <span className="text-muted">—</span>}
                            </td>

                            {/* Rentabilidade */}
                            <td className="px-4 py-3 text-right text-xs">
                              {gainPct !== null
                                ? <span className={`font-semibold ${gainColor(gainPct)}`}>{fmtPct(gainPct)}</span>
                                : <span className="text-muted">—</span>}
                            </td>

                            {/* Dividendos */}
                            <td className="px-4 py-3 text-right font-mono text-xs text-success">
                              {divs > 0 ? fmt(divs) : <span className="text-muted">—</span>}
                            </td>

                            {/* Retorno Total */}
                            <td className="px-4 py-3 text-right text-xs">
                              {retTotal !== null ? (
                                <div className="flex flex-col items-end">
                                  <span className={`font-semibold ${gainColor(retTotal)}`}>{fmt(retTotal)}</span>
                                  {retTotalPct !== null && (
                                    <span className={`text-xs ${gainColor(retTotalPct)}`}>{fmtPct(retTotalPct)}</span>
                                  )}
                                </div>
                              ) : <span className="text-muted">—</span>}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  title="Compra/Venda"
                                  className="rounded p-1.5 text-muted hover:bg-surface hover:text-text transition-colors"
                                  onClick={() => setShowAddOp(asset)}
                                >
                                  <ArrowUpCircle size={14} />
                                </button>
                                <button
                                  title="Dividendo"
                                  className="rounded p-1.5 text-muted hover:bg-surface hover:text-success transition-colors"
                                  onClick={() => setShowAddDiv(asset)}
                                >
                                  <Gift size={14} />
                                </button>
                                <button
                                  title="Remover ativo"
                                  className="rounded p-1.5 text-muted hover:bg-surface hover:text-danger transition-colors"
                                  onClick={() => handleDeleteAsset(asset.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expanded: operations + dividends history */}
                          {expandedId === asset.id && (
                            <tr key={`${asset.id}-detail`} className="bg-surface/40">
                              <td colSpan={12} className="px-6 pb-4 pt-2">
                                <OperationHistory
                                  ops={assetOps[asset.id] ?? []}
                                  divs={assetDivs[asset.id] ?? []}
                                  onDeleteOp={opId => handleDeleteOp(asset.id, opId)}
                                  onDeleteDiv={divId => handleDeleteDiv(asset.id, divId)}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>

                  {/* Table footer totals */}
                  {rows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-surface text-xs font-semibold">
                        <td className="px-4 py-2.5 text-muted" colSpan={5}>Total da carteira</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmt(totalInvested)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmt(totalMarket)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${gainColor(totalGain)}`}>{fmt(totalGain)}</td>
                        <td className={`px-4 py-2.5 text-right ${gainColor(totalGainPct)}`}>{fmtPct(totalGainPct)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-success">{fmt(totalDivs)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${gainColor(totalReturn)}`}>
                          {fmt(totalReturn)}<br />
                          <span className="font-normal">{fmtPct(totalRetPct)}</span>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}

      {showImport && (
        <B3ImportModal
          portfolioId={portfolioId}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      <Modal open={showAddAsset} onClose={() => setShowAddAsset(false)} title="Add Ativo">
        <form onSubmit={handleAddAsset} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input id="ticker" placeholder="ex: PETR4" value={ticker} onChange={e => setTicker(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-name">Nome (opcional)</Label>
            <Input id="asset-name" placeholder="ex: Petrobras PN" value={assetName} onChange={e => setAssetName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-class">Classe</Label>
            <Select id="asset-class" value={assetClass} onChange={e => setAssetClass(e.target.value)} options={ASSET_CLASS_OPTIONS} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddAsset(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Adicionando…" : "Adicionar"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showAddOp} onClose={() => setShowAddOp(null)} title={`Operação — ${showAddOp?.ticker ?? ""}`}>
        <form onSubmit={handleAddOp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              {["buy", "sell"].map(t => (
                <button key={t} type="button" onClick={() => setOpType(t)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-card border py-2 text-sm font-medium transition-colors ${
                    opType === t
                      ? t === "buy" ? "border-primary bg-primary-bg text-primary" : "border-danger bg-danger-bg text-danger"
                      : "border-border text-muted hover:bg-surface"
                  }`}>
                  {t === "buy" ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                  {t === "buy" ? "Compra" : "Venda"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-qty">Quantidade</Label>
              <Input id="op-qty" type="number" step="any" min="0" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-price">Preço unitário (R$)</Label>
              <Input id="op-price" type="number" step="any" min="0" placeholder="0.00" value={price} onChange={e => setPrice(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-date">Data</Label>
              <Input id="op-date" type="date" value={opDate} onChange={e => setOpDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-broker">Corretora (opcional)</Label>
              <Input id="op-broker" placeholder="ex: XP" value={broker} onChange={e => setBroker(e.target.value)} />
            </div>
          </div>
          {qty && price && (
            <p className="text-xs text-muted">
              Total: <span className="font-medium text-text">{fmt(String(Number(qty) * Number(price)))}</span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddOp(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showAddDiv} onClose={() => setShowAddDiv(null)} title={`Dividendo — ${showAddDiv?.ticker ?? ""}`}>
        <form onSubmit={handleAddDiv} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-amount">Valor (R$)</Label>
              <Input id="div-amount" type="number" step="any" min="0" placeholder="0.00" value={divAmount} onChange={e => setDivAmount(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-date">Data</Label>
              <Input id="div-date" type="date" value={divDate} onChange={e => setDivDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddDiv(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, color, loading,
}: {
  label: string; value: string; sub?: string; color?: string; loading?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      {loading
        ? <div className="h-6 w-24 rounded bg-border animate-pulse" />
        : <p className={`text-lg font-bold ${color ?? "text-text"}`}>{value}</p>}
      {sub && !loading && <p className={`mt-0.5 text-xs font-medium ${color ?? "text-muted"}`}>{sub}</p>}
    </div>
  );
}

function OperationHistory({
  ops, divs, onDeleteOp, onDeleteDiv,
}: {
  ops: Operation[]; divs: Dividend[];
  onDeleteOp: (id: number) => void; onDeleteDiv: (id: number) => void;
}) {
  if (ops.length === 0 && divs.length === 0) {
    return <p className="text-xs text-muted py-2">Nenhuma operação registrada.</p>;
  }

  function fmtQty(v: string) {
    const n = Number(v);
    return n % 1 === 0 ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  }
  function fmt(v: string | number) {
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <div className="flex flex-col gap-3">
      {ops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Operações</p>
          <div className="flex flex-col gap-1">
            {ops.map(op => (
              <div key={op.id} className="flex items-center gap-4 text-xs rounded border border-border px-3 py-2 bg-bg">
                <span className={`font-medium w-14 ${op.type === "buy" ? "text-primary" : "text-danger"}`}>
                  {op.type === "buy" ? "COMPRA" : "VENDA"}
                </span>
                <span className="text-muted w-24">{op.date}</span>
                <span className="text-muted flex-1">{fmtQty(op.quantity)} × {fmt(op.unit_price)}</span>
                <span className="font-medium text-text">{fmt(op.total_amount)}</span>
                {op.broker && <span className="text-muted">{op.broker}</span>}
                <button onClick={() => onDeleteOp(op.id)} className="ml-auto text-muted hover:text-danger">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {divs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Dividendos</p>
          <div className="flex flex-col gap-1">
            {divs.map(d => (
              <div key={d.id} className="flex items-center gap-4 text-xs rounded border border-border px-3 py-2 bg-bg">
                <span className="text-success font-medium w-14">DIV</span>
                <span className="text-muted w-24">{d.date}</span>
                <span className="font-medium text-success">{fmt(d.amount)}</span>
                {d.note && <span className="text-muted">{d.note}</span>}
                <button onClick={() => onDeleteDiv(d.id)} className="ml-auto text-muted hover:text-danger">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
