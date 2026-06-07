"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus, Trash2, ArrowUpCircle, ArrowDownCircle,
  Gift, ChevronDown, ChevronRight, Upload, RefreshCw, Pencil,
} from "lucide-react";
import {
  Cell, Legend, Pie, PieChart, Bar, BarChart,
  Line, LineChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Asset, AssetPosition, Dividend, MonthlySnapshot, Operation, PortfolioPosition } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { B3ImportModal } from "./import-modal";

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_CLASS_OPTIONS = [
  { value: "stock",  label: "Stock (Ação)" },
  { value: "fii",    label: "FII" },
  { value: "etf",    label: "ETF" },
  { value: "bdr",    label: "BDR" },
  { value: "bond",   label: "Renda Fixa" },
  { value: "crypto", label: "Crypto" },
  { value: "other",  label: "Outro" },
];

const CURRENCY_OPTIONS = [
  { value: "BRL", label: "R$ (Real)" },
  { value: "USD", label: "US$ (Dólar)" },
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

const CLASS_COLORS: Record<string, string> = {
  stock:  "#3B82F6",
  fii:    "#06B6D4",
  etf:    "#6366F1",
  bdr:    "#A855F7",
  bond:   "#22C55E",
  crypto: "#F59E0B",
  other:  "#6B7280",
};

const CLASS_LABELS: Record<string, string> = {
  stock:  "Ações",
  fii:    "FIIs",
  etf:    "ETFs",
  bdr:    "BDRs",
  bond:   "Renda Fixa",
  crypto: "Criptomoedas",
  other:  "Outros",
};

const CLASS_ORDER = ["stock", "fii", "etf", "bdr", "bond", "crypto", "other"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtUSD(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtCurrency(v: number, currency: string) {
  return currency === "USD" ? fmtUSD(v) : fmtBRL(v);
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

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

function gainColor(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-muted";
}

// ── Price fetching ────────────────────────────────────────────────────────────

interface PriceData { price: number; changePercent: number; estimated?: boolean }

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function fetchPrices(tickers: string[]): Promise<Record<string, PriceData>> {
  if (tickers.length === 0) return {};
  try {
    const res = await fetch(`${BASE}/api/v1/prices?tickers=${encodeURIComponent(tickers.join(","))}`);
    if (!res.ok) return {};
    const data: { symbol: string; price: number; change_percent: number; estimated: boolean }[] = await res.json();
    const out: Record<string, PriceData> = {};
    data.forEach(r => { out[r.symbol] = { price: r.price, changePercent: r.change_percent, estimated: r.estimated }; });
    return out;
  } catch {
    return {};
  }
}

async function fetchUsdBrl(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/prices/usdbrl`);
    if (!res.ok) return null;
    const data: { symbol: string; price: number } = await res.json();
    return data.price;
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssetRow { asset: Asset; pos: AssetPosition }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const portfolioId = Number(id);
  const { isAdmin, currentTenantId } = useAuth();
  const router = useRouter();
  const initialTenantRef = useRef<number | null>(null);
  const pricesLoadedRef  = useRef(false);

  useEffect(() => {
    if (currentTenantId === null) return;
    if (initialTenantRef.current === null) {
      initialTenantRef.current = currentTenantId;
      return;
    }
    if (currentTenantId !== initialTenantRef.current) {
      router.push("/portfolios");
    }
  }, [currentTenantId, router]);

  const [assets, setAssets]     = useState<Asset[]>([]);
  const [position, setPosition] = useState<PortfolioPosition | null>(null);
  const [loading, setLoading]   = useState(true);
  const [prices, setPrices]     = useState<Record<string, PriceData>>({});
  const [usdBrl, setUsdBrl]     = useState<number | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesUpdated, setPricesUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "assets">("overview");
  const [history, setHistory]           = useState<MonthlySnapshot[]>([]);
  const [historyYear, setHistoryYear]   = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [assetOps, setAssetOps]   = useState<Record<number, Operation[]>>({});
  const [assetDivs, setAssetDivs] = useState<Record<number, Dividend[]>>({});

  const [showAddAsset, setShowAddAsset]   = useState(false);
  const [showImport, setShowImport]       = useState(false);
  const [showAddOp, setShowAddOp]         = useState<Asset | null>(null);
  const [showAddDiv, setShowAddDiv]       = useState<Asset | null>(null);
  const [showEditAsset, setShowEditAsset] = useState<Asset | null>(null);
  const [editClass, setEditClass]         = useState("stock");

  const [ticker, setTicker]               = useState("");
  const [assetName, setAssetName]         = useState("");
  const [assetClass, setAssetClass]       = useState("stock");
  const [assetCurrency, setAssetCurrency] = useState("BRL");
  const [opType, setOpType]               = useState("buy");
  const [qty, setQty]                     = useState("");
  const [price, setPrice]                 = useState("");
  const [opDate, setOpDate]               = useState(new Date().toISOString().slice(0, 10));
  const [broker, setBroker]               = useState("");
  const [divAmount, setDivAmount]         = useState("");
  const [divDate, setDivDate]             = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]               = useState(false);

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

  const loadPrices = useCallback(async (rows: AssetRow[]) => {
    if (rows.length === 0) return;
    setPricesLoading(true);
    const tickers = rows.map(r => r.asset.ticker);
    const hasUsd  = rows.some(r => r.asset.currency === "USD");

    const [priceData, rate] = await Promise.all([
      fetchPrices(tickers),
      hasUsd ? fetchUsdBrl() : Promise.resolve(null),
    ]);

    setPrices(priceData);
    if (rate !== null) setUsdBrl(rate);
    setPricesUpdated(new Date());
    setPricesLoading(false);
  }, []);

  const loadHistory = useCallback(async (year: number | null, rate: number | null) => {
    setHistoryLoading(true);
    try {
      const data = await api.portfolios.history(portfolioId, year ?? undefined, rate ?? undefined);
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { load(); }, [load]);

  const posMap: Record<number, AssetPosition> = {};
  position?.positions.forEach((p) => { posMap[p.asset_id] = p; });

  const rows: AssetRow[] = assets
    .filter(a => { const p = posMap[a.id]; return p && Number(p.quantity) > 0; })
    .map(a => ({ asset: a, pos: posMap[a.id] }));

  useEffect(() => {
    if (rows.length > 0 && !pricesLoadedRef.current) {
      pricesLoadedRef.current = true;
      loadPrices(rows);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, position]);

  useEffect(() => { loadHistory(historyYear, usdBrl); }, [loadHistory, historyYear, usdBrl]);

  // ── Summary totals ─────────────────────────────────────────────────────────

  let totalInvested = 0;
  let totalMarket   = 0;
  let totalDivs     = 0;
  let pricedCount   = 0;

  rows.forEach(({ pos, asset }) => {
    const q     = Number(pos.quantity);
    const pm    = Number(pos.avg_price);
    const isUsd = asset.currency === "USD";
    const rate  = isUsd ? (usdBrl ?? 1) : 1;
    totalInvested += q * pm * rate;
    totalDivs     += Number(pos.total_dividends);
    const p = prices[asset.ticker];
    if (p) { totalMarket += q * p.price * rate; pricedCount++; }
    else   { totalMarket += q * pm * rate; }
  });

  const totalGain    = totalMarket - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;
  const totalReturn  = totalGain + totalDivs;
  const totalRetPct  = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  // ── Chart data ─────────────────────────────────────────────────────────────

  const allocationByClass: Record<string, { invested: number; market: number }> = {};
  rows.forEach(({ pos, asset }) => {
    const q      = Number(pos.quantity);
    const pm     = Number(pos.avg_price);
    const isUsd  = asset.currency === "USD";
    const rate   = isUsd ? (usdBrl ?? 1) : 1;
    const pd     = prices[asset.ticker];
    const inv    = q * pm * rate;
    const mkt    = pd ? q * pd.price * rate : inv;
    const cls    = asset.asset_class;
    if (!allocationByClass[cls]) allocationByClass[cls] = { invested: 0, market: 0 };
    allocationByClass[cls].invested += inv;
    allocationByClass[cls].market   += mkt;
  });

  const donutData = CLASS_ORDER
    .filter(c => allocationByClass[c])
    .map(c => ({
      name:  CLASS_LABELS[c] ?? c,
      value: Math.round(allocationByClass[c].market * 100) / 100,
      pct:   totalMarket > 0 ? ((allocationByClass[c].market / totalMarket) * 100).toFixed(1) : "0",
      color: CLASS_COLORS[c] ?? "#6B7280",
    }));

  const barData = CLASS_ORDER
    .filter(c => allocationByClass[c])
    .map(c => ({
      name:      CLASS_LABELS[c] ?? c,
      Investido: Math.round(allocationByClass[c].invested),
      Mercado:   Math.round(allocationByClass[c].market),
    }));

  // ── History chart data ────────────────────────────────────────────────────

  const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const historyChartData = history.map(h => ({
    label: `${MONTHS_PT[h.month - 1]}/${String(h.year).slice(2)}`,
    mercado:   Number(h.market_value) > 0 ? Number(h.market_value) : null,
    investido: Number(h.total_invested),
  }));

  const availableYears = [...new Set(history.map(h => h.year))].sort();

  // ── Group rows by class ────────────────────────────────────────────────────

  const rowsByClass: Partial<Record<string, AssetRow[]>> = {};
  rows.forEach(row => {
    const cls = row.asset.asset_class;
    if (!rowsByClass[cls]) rowsByClass[cls] = [];
    rowsByClass[cls]!.push(row);
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function toggleAsset(assetId: number) {
    if (expandedId === assetId) { setExpandedId(null); return; }
    setExpandedId(assetId);
    if (!assetOps[assetId]?.length) {
      try {
        const [ops, divs] = await Promise.all([
          api.portfolios.operations(portfolioId, assetId),
          api.portfolios.dividends(portfolioId),
        ]);
        setAssetOps(prev  => ({ ...prev, [assetId]: ops }));
        setAssetDivs(prev => ({ ...prev, [assetId]: divs.filter(d => d.asset_id === assetId) }));
      } catch { /* leave empty */ }
    }
  }

  function openEditAsset(asset: Asset) {
    setEditClass(asset.asset_class);
    setShowEditAsset(asset);
  }

  async function handleEditAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!showEditAsset) return;
    setSaving(true);
    try {
      await api.portfolios.updateAsset(portfolioId, showEditAsset.id, { asset_class: editClass });
      toast.success("Ativo atualizado");
      setShowEditAsset(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally { setSaving(false); }
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
        currency: assetCurrency,
      });
      toast.success("Ativo adicionado");
      setShowAddAsset(false);
      setTicker(""); setAssetName(""); setAssetClass("stock"); setAssetCurrency("BRL");
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
      setExpandedId(null);
      await load();
      setAssetOps(prev => { const n = { ...prev }; delete n[assetId]; return n; });
      setAssetDivs(prev => { const n = { ...prev }; delete n[assetId]; return n; });
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
      setExpandedId(null);
      await load();
      setAssetOps(prev => { const n = { ...prev }; delete n[assetId]; return n; });
      setAssetDivs(prev => { const n = { ...prev }; delete n[assetId]; return n; });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar");
    } finally { setSaving(false); }
  }

  async function handleUpdateOp(assetId: number, opId: number, data: {
    type?: string; quantity?: string; unit_price?: string; date?: string; broker?: string; note?: string;
  }) {
    await api.portfolios.updateOperation(portfolioId, assetId, opId, data);
    const [, ops, divs] = await Promise.all([
      load(),
      api.portfolios.operations(portfolioId, assetId),
      api.portfolios.dividends(portfolioId),
    ]);
    setAssetOps(prev => ({ ...prev, [assetId]: ops }));
    setAssetDivs(prev => ({ ...prev, [assetId]: divs.filter(d => d.asset_id === assetId) }));
    toast.success("Operação atualizada");
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
        action={isAdmin ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowImport(true)}>
              <Upload size={14} className="mr-1.5" />Importar B3
            </Button>
            <Button size="sm" onClick={() => setShowAddAsset(true)}>
              <Plus size={14} className="mr-1.5" />Add Ativo
            </Button>
          </div>
        ) : undefined}
      />

      <div className="flex flex-col flex-1 overflow-auto px-6 py-5 gap-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : (
          <>
            {/* ── Summary cards (always visible) ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryCard label="Total Investido"  value={fmtBRL(totalInvested)} />
              <SummaryCard label="Valor de Mercado" value={fmtBRL(totalMarket)}   loading={pricesLoading} />
              <SummaryCard
                label="Resultado"
                value={fmtBRL(totalGain)}
                sub={fmtPct(totalGainPct)}
                color={gainColor(totalGain)}
                loading={pricesLoading}
              />
              <SummaryCard label="Dividendos"   value={fmtBRL(totalDivs)}    color="text-success" />
              <SummaryCard
                label="Retorno Total"
                value={fmtBRL(totalReturn)}
                sub={fmtPct(totalRetPct)}
                color={gainColor(totalReturn)}
                loading={pricesLoading}
              />
            </div>

            {/* ── Price status bar ── */}
            <div className="flex items-center gap-2 text-xs text-muted -mt-2">
              {pricesLoading && <Spinner className="h-3 w-3" />}
              {pricesUpdated && !pricesLoading && (
                <>
                  <span>
                    Preços via Yahoo Finance · atualizado às{" "}
                    {pricesUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {usdBrl !== null && ` · USD/BRL ${usdBrl.toFixed(2)}`}
                    {pricedCount < rows.length && ` · ${rows.length - pricedCount} ativo(s) sem cotação`}
                    {Object.values(prices).some(p => p.estimated) && " · Tesouro Prefixado: estimado via BCB (±5%)"}
                  </span>
                  <button
                    onClick={() => loadPrices(rows)}
                    className="ml-1 hover:text-text transition-colors"
                    title="Atualizar cotações"
                  >
                    <RefreshCw size={11} />
                  </button>
                </>
              )}
            </div>

            {/* ── Tabs ── */}
            <div className="flex border-b border-border -mt-2">
              {(["overview", "assets"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {tab === "overview" ? "Visão Geral" : "Ativos"}
                </button>
              ))}
            </div>

            {/* ── Tab: Visão Geral ── */}
            {activeTab === "overview" && (
              rows.length === 0 ? (
                <p className="text-sm text-muted">
                  Nenhuma posição ativa. Importe seu extrato da B3 ou adicione um ativo manualmente.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Donut — Alocação por Classe */}
                  <div className="rounded-card border border-border bg-surface p-4">
                    <p className="text-sm font-semibold text-text mb-4">Alocação por Classe</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={72}
                          outerRadius={108}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {donutData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} stroke="transparent" />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as { name: string; value: number; pct: string };
                            return (
                              <div className="rounded-card border border-border bg-bg px-3 py-2 text-xs shadow-md">
                                <p className="font-semibold text-text mb-0.5">{d.name}</p>
                                <p className="text-muted">{fmtBRL(d.value)}</p>
                                <p className="text-muted">{d.pct}% da carteira</p>
                              </div>
                            );
                          }}
                        />
                        <Legend
                          formatter={(value) => (
                            <span className="text-xs text-muted">{value}</span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Bar — Investido vs Mercado */}
                  <div className="rounded-card border border-border bg-surface p-4">
                    <p className="text-sm font-semibold text-text mb-4">Investido vs Mercado</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={barData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                        barCategoryGap="30%"
                        barGap={3}
                      >
                        <XAxis
                          type="number"
                          tickFormatter={fmtK}
                          tick={{ fontSize: 10, fill: "currentColor" }}
                          className="text-muted"
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={88}
                          tick={{ fontSize: 11, fill: "currentColor" }}
                          className="text-muted"
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="rounded-card border border-border bg-bg px-3 py-2 text-xs shadow-md">
                                <p className="font-semibold text-text mb-1">{label}</p>
                                {payload.map((p) => (
                                  <p key={p.name} className="text-muted">
                                    <span style={{ color: p.fill }} className="mr-1">■</span>
                                    {p.name}: <span className="font-medium text-text">{fmtBRL(Number(p.value))}</span>
                                  </p>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Legend
                          formatter={(value) => (
                            <span className="text-xs text-muted">{value}</span>
                          )}
                        />
                        <Bar dataKey="Investido" fill="#6366F1" radius={[0, 3, 3, 0]} barSize={9} />
                        <Bar dataKey="Mercado"   fill="#3B82F6" radius={[0, 3, 3, 0]} barSize={9} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Allocation table — quick breakdown */}
                  <div className="rounded-card border border-border bg-surface p-4 lg:col-span-2">
                    <p className="text-sm font-semibold text-text mb-3">Resumo por Classe</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-border text-left text-muted">
                            <th className="pb-2 font-medium">Classe</th>
                            <th className="pb-2 font-medium text-right">Ativos</th>
                            <th className="pb-2 font-medium text-right">Investido</th>
                            <th className="pb-2 font-medium text-right">Mercado</th>
                            <th className="pb-2 font-medium text-right">Resultado</th>
                            <th className="pb-2 font-medium text-right">% Carteira</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CLASS_ORDER.filter(c => allocationByClass[c]).map(cls => {
                            const { invested, market } = allocationByClass[cls];
                            const gain = market - invested;
                            const pct  = totalMarket > 0 ? (market / totalMarket) * 100 : 0;
                            const count = rowsByClass[cls]?.length ?? 0;
                            return (
                              <tr key={cls} className="border-b border-border last:border-0 hover:bg-surface/60">
                                <td className="py-2">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ background: CLASS_COLORS[cls] }}
                                    />
                                    <span className="font-medium text-text">{CLASS_LABELS[cls]}</span>
                                  </div>
                                </td>
                                <td className="py-2 text-right text-muted">{count}</td>
                                <td className="py-2 text-right font-mono text-muted">{fmtBRL(invested)}</td>
                                <td className="py-2 text-right font-mono text-text">{fmtBRL(market)}</td>
                                <td className={`py-2 text-right font-mono font-semibold ${gainColor(gain)}`}>{fmtBRL(gain)}</td>
                                <td className="py-2 text-right text-muted">{pct.toFixed(1)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Evolução Patrimonial */}
                  <div className="rounded-card border border-border bg-surface p-4 lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-text">Evolução Patrimonial</p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setHistoryYear(null)}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                            historyYear === null ? "bg-primary text-white" : "text-muted hover:text-text hover:bg-surface"
                          }`}
                        >
                          Tudo
                        </button>
                        {availableYears.map(y => (
                          <button
                            key={y}
                            onClick={() => setHistoryYear(y)}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                              historyYear === y ? "bg-primary text-white" : "text-muted hover:text-text hover:bg-surface"
                            }`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    </div>
                    {historyLoading ? (
                      <div className="flex items-center justify-center h-[200px]"><Spinner /></div>
                    ) : historyChartData.length === 0 ? (
                      <p className="text-xs text-muted text-center py-8">Sem dados de operações.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={historyChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap="25%" barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={fmtK}
                            tick={{ fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={52}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              return (
                                <div className="rounded-card border border-border bg-bg px-3 py-2 text-xs shadow-md">
                                  <p className="font-semibold text-text mb-1">{label}</p>
                                  {payload.map(p => p.value != null && (
                                    <p key={p.dataKey} className="text-muted">
                                      <span style={{ color: p.fill }} className="mr-1">■</span>
                                      {p.name}: <span className="font-medium text-text">{fmtBRL(Number(p.value))}</span>
                                    </p>
                                  ))}
                                </div>
                              );
                            }}
                          />
                          <Legend formatter={(v) => <span className="text-xs text-muted">{v}</span>} />
                          <Bar dataKey="investido" name="Custo"    fill="#6366F1" radius={[3, 3, 0, 0]} maxBarSize={18} />
                          <Bar dataKey="mercado"   name="Mercado"  fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              )
            )}

            {/* ── Tab: Ativos (grouped by class) ── */}
            {activeTab === "assets" && (
              rows.length === 0 ? (
                <p className="text-sm text-muted">
                  Nenhuma posição ativa. Importe seu extrato da B3 ou adicione um ativo manualmente.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {CLASS_ORDER.filter(c => rowsByClass[c]?.length).map(cls => (
                    <AssetClassSection
                      key={cls}
                      cls={cls}
                      rows={rowsByClass[cls]!}
                      prices={prices}
                      usdBrl={usdBrl}
                      pricesLoading={pricesLoading}
                      expandedId={expandedId}
                      assetOps={assetOps}
                      assetDivs={assetDivs}
                      isAdmin={isAdmin}
                      onToggle={toggleAsset}
                      onAddOp={setShowAddOp}
                      onAddDiv={setShowAddDiv}
                      onDeleteAsset={handleDeleteAsset}
                      onUpdateAsset={openEditAsset}
                      onUpdateOp={handleUpdateOp}
                      onDeleteOp={handleDeleteOp}
                      onDeleteDiv={handleDeleteDiv}
                    />
                  ))}
                </div>
              )
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
            <Input id="ticker" placeholder="ex: PETR4 ou IVV" value={ticker} onChange={e => setTicker(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-name">Nome (opcional)</Label>
            <Input id="asset-name" placeholder="ex: Petrobras PN" value={assetName} onChange={e => setAssetName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="asset-class">Classe</Label>
              <Select id="asset-class" value={assetClass} onChange={e => setAssetClass(e.target.value)} options={ASSET_CLASS_OPTIONS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="asset-currency">Moeda</Label>
              <Select id="asset-currency" value={assetCurrency} onChange={e => setAssetCurrency(e.target.value)} options={CURRENCY_OPTIONS} />
            </div>
          </div>
          {assetCurrency === "USD" && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
              Ativo em dólar — registre preços e operações em USD. O sistema converte para BRL automaticamente na visualização.
            </p>
          )}
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
              <Label htmlFor="op-price">
                Preço unitário ({showAddOp?.currency === "USD" ? "US$" : "R$"})
              </Label>
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
              Total:{" "}
              <span className="font-medium text-text">
                {fmtCurrency(Number(qty) * Number(price), showAddOp?.currency ?? "BRL")}
              </span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddOp(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showEditAsset} onClose={() => setShowEditAsset(null)} title={`Editar — ${showEditAsset?.ticker ?? ""}`}>
        <form onSubmit={handleEditAsset} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-class">Classe do ativo</Label>
            <Select id="edit-class" value={editClass} onChange={e => setEditClass(e.target.value)} options={ASSET_CLASS_OPTIONS} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowEditAsset(null)}>Cancelar</Button>
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

// ── AssetClassSection ─────────────────────────────────────────────────────────

function AssetClassSection({
  cls, rows, prices, usdBrl, pricesLoading,
  expandedId, assetOps, assetDivs, isAdmin,
  onToggle, onAddOp, onAddDiv, onDeleteAsset, onUpdateAsset, onUpdateOp, onDeleteOp, onDeleteDiv,
}: {
  cls: string;
  rows: AssetRow[];
  prices: Record<string, PriceData>;
  usdBrl: number | null;
  pricesLoading: boolean;
  expandedId: number | null;
  assetOps: Record<number, Operation[]>;
  assetDivs: Record<number, Dividend[]>;
  isAdmin: boolean;
  onToggle: (id: number) => void;
  onAddOp: (a: Asset) => void;
  onAddDiv: (a: Asset) => void;
  onDeleteAsset: (id: number) => void;
  onUpdateAsset: (a: Asset) => void;
  onUpdateOp: (assetId: number, opId: number, data: {type?: string; quantity?: string; unit_price?: string; date?: string; broker?: string; note?: string}) => Promise<void>;
  onDeleteOp: (assetId: number, opId: number) => void;
  onDeleteDiv: (assetId: number, divId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  // Ordena alfabeticamente para IVV/IVVB11 ficarem adjacentes
  const sortedRows = [...rows].sort((a, b) => a.asset.ticker.localeCompare(b.asset.ticker));

  let secInvested = 0, secMarket = 0;
  sortedRows.forEach(({ pos, asset }) => {
    const q    = Number(pos.quantity);
    const pm   = Number(pos.avg_price);
    const rate = asset.currency === "USD" ? (usdBrl ?? 1) : 1;
    const pd   = prices[asset.ticker];
    secInvested += q * pm * rate;
    secMarket   += pd ? q * pd.price * rate : q * pm * rate;
  });
  const secGain = secMarket - secInvested;

  return (
    <div className="rounded-card border border-border overflow-hidden">
      {/* Section header — clicável para colapsar */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-surface border-b border-border hover:bg-surface/80 transition-colors text-left"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2.5">
          {collapsed
            ? <ChevronRight size={14} className="text-muted shrink-0" />
            : <ChevronDown size={14} className="text-muted shrink-0" />}
          <span
            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: CLASS_COLORS[cls] ?? "#6B7280" }}
          />
          <span className="font-semibold text-sm text-text">{CLASS_LABELS[cls] ?? cls}</span>
          <span className="text-xs text-muted">{sortedRows.length} ativo{sortedRows.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted font-mono">{fmtBRL(secInvested)}</span>
          <span className="font-mono font-medium text-text">{fmtBRL(secMarket)}</span>
          <span className={`font-mono font-semibold ${gainColor(secGain)}`}>{fmtBRL(secGain)}</span>
        </div>
      </button>

      {/* Table */}
      {!collapsed && <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Ativo</th>
              <th className="px-4 py-2 font-medium text-right">Qtd</th>
              <th className="px-4 py-2 font-medium text-right">PM</th>
              <th className="px-4 py-2 font-medium text-right">Preço Atual</th>
              <th className="px-4 py-2 font-medium text-right">Total Investido</th>
              <th className="px-4 py-2 font-medium text-right">Valor Atual</th>
              <th
                className="px-4 py-2 font-medium text-right cursor-help"
                title="Para ativos USD: resultado calculado com câmbio atual (não o câmbio da compra). Para Tesouro: estimativa via BCB ±5%."
              >Resultado</th>
              <th
                className="px-4 py-2 font-medium text-right cursor-help"
                title="Para ativos USD: rentabilidade em dólar (variação cambial não incluída). Para Tesouro: estimativa."
              >Rent.</th>
              <th className="px-4 py-2 font-medium text-right">Dividendos</th>
              <th className="px-4 py-2 font-medium text-right">Ret. Total</th>
              <th className="px-4 py-2 font-medium w-20" />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ asset, pos }) => {
              const q           = Number(pos.quantity);
              const pm          = Number(pos.avg_price);
              const isUsd       = asset.currency === "USD";
              const rate        = isUsd ? (usdBrl ?? 1) : 1;
              const pd          = prices[asset.ticker];
              const isEstimated = pd?.estimated === true;
              const curNative   = pd?.price ?? null;
              const investedBRL = q * pm * rate;
              const marketBRL   = curNative !== null ? q * curNative * rate : null;
              const gainR       = marketBRL !== null ? marketBRL - investedBRL : null;
              // Para USD: taxa cancela → retorno em USD; Para BRL: retorno em BRL
              const gainPct     = gainR !== null && investedBRL > 0 ? (gainR / investedBRL) * 100 : null;
              const divs        = Number(pos.total_dividends);
              const retTotal    = gainR !== null ? gainR + divs : null;
              const retTotalPct = retTotal !== null && investedBRL > 0 ? (retTotal / investedBRL) * 100 : null;

              return (
                <Fragment key={asset.id}>
                  <tr
                    className="border-b border-border last:border-0 hover:bg-surface/60 cursor-pointer transition-colors"
                    onClick={() => onToggle(asset.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {expandedId === asset.id
                          ? <ChevronDown size={13} className="text-muted shrink-0" />
                          : <ChevronRight size={13} className="text-muted shrink-0" />}
                        <span className="font-semibold text-text">{asset.ticker}</span>
                        {asset.name && <span className="text-xs text-muted hidden lg:inline">{asset.name}</span>}
                        {isUsd && (
                          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            USD
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs">{fmtQty(pos.quantity)}</td>

                    <td className="px-4 py-3 text-right font-mono text-xs text-muted">
                      {fmtCurrency(pm, asset.currency)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {pricesLoading
                        ? <span className="text-muted">…</span>
                        : curNative !== null
                          ? pd?.estimated
                            ? <span className="font-medium text-amber-600 dark:text-amber-400" title="Estimado via BCB (±5%). Não é cotação de mercado oficial.">
                                ~{fmtCurrency(curNative, asset.currency)}
                              </span>
                            : <span className="font-medium text-text">{fmtCurrency(curNative, asset.currency)}</span>
                          : <span className="text-muted">—</span>}
                    </td>

                    <td
                      className="px-4 py-3 text-right font-mono text-xs text-muted"
                      title={isUsd ? "Calculado com câmbio atual. O valor real em BRL na compra pode ser diferente." : undefined}
                    >{fmtBRL(investedBRL)}</td>

                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {marketBRL !== null
                        ? <span className={`font-medium ${isEstimated ? "text-amber-600 dark:text-amber-400" : "text-text"}`}>{fmtBRL(marketBRL)}</span>
                        : <span className="text-muted">—</span>}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {gainR !== null ? (
                        <span
                          className={`font-semibold ${isEstimated ? "text-amber-600 dark:text-amber-400" : gainColor(gainR)}`}
                          title={isEstimated ? "Estimado via BCB (±5%)" : isUsd ? "Resultado em BRL com câmbio atual (não inclui variação cambial histórica)" : undefined}
                        >
                          {isEstimated ? "~" : ""}{fmtBRL(gainR)}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>

                    <td className="px-4 py-3 text-right text-xs">
                      {gainPct !== null ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`font-semibold ${isEstimated ? "text-amber-600 dark:text-amber-400" : gainColor(gainPct)}`}
                            title={isEstimated ? "Estimado via BCB (±5%)" : isUsd ? "Rentabilidade em USD (câmbio não incluído)" : undefined}
                          >
                            {isEstimated ? "~" : ""}{fmtPct(gainPct)}
                          </span>
                          {isUsd && !isEstimated && (
                            <span className="text-xs text-amber-500 dark:text-amber-400 font-normal">USD</span>
                          )}
                        </div>
                      ) : <span className="text-muted">—</span>}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-xs text-success">
                      {divs > 0 ? fmtBRL(divs) : <span className="text-muted">—</span>}
                    </td>

                    <td className="px-4 py-3 text-right text-xs">
                      {retTotal !== null ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold ${isEstimated ? "text-amber-600 dark:text-amber-400" : gainColor(retTotal)}`}>
                            {isEstimated ? "~" : ""}{fmtBRL(retTotal)}
                          </span>
                          {retTotalPct !== null && (
                            <span className={`text-xs ${isEstimated ? "text-amber-500 dark:text-amber-400" : gainColor(retTotalPct)}`}>
                              {isEstimated ? "~" : ""}{fmtPct(retTotalPct)}
                            </span>
                          )}
                        </div>
                      ) : <span className="text-muted">—</span>}
                    </td>

                    <td className="px-4 py-3">
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            title="Editar classe"
                            className="rounded p-1.5 text-muted hover:bg-surface hover:text-text transition-colors"
                            onClick={() => onUpdateAsset(asset)}
                          ><Pencil size={13} /></button>
                          <button
                            title="Compra/Venda"
                            className="rounded p-1.5 text-muted hover:bg-surface hover:text-text transition-colors"
                            onClick={() => onAddOp(asset)}
                          ><ArrowUpCircle size={14} /></button>
                          <button
                            title="Dividendo"
                            className="rounded p-1.5 text-muted hover:bg-surface hover:text-success transition-colors"
                            onClick={() => onAddDiv(asset)}
                          ><Gift size={14} /></button>
                          <button
                            title="Remover ativo"
                            className="rounded p-1.5 text-muted hover:bg-surface hover:text-danger transition-colors"
                            onClick={() => onDeleteAsset(asset.id)}
                          ><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {expandedId === asset.id && (
                    <tr className="bg-surface/40">
                      <td colSpan={12} className="px-6 pb-4 pt-2">
                        <OperationHistory
                          ops={assetOps[asset.id] ?? []}
                          divs={assetDivs[asset.id] ?? []}
                          currency={asset.currency}
                          isAdmin={isAdmin}
                          onUpdateOp={(opId, data) => onUpdateOp(asset.id, opId, data)}
                          onDeleteOp={opId => onDeleteOp(asset.id, opId)}
                          onDeleteDiv={divId => onDeleteDiv(asset.id, divId)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>}
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
  ops, divs, currency, isAdmin, onUpdateOp, onDeleteOp, onDeleteDiv,
}: {
  ops: Operation[]; divs: Dividend[];
  currency: string;
  isAdmin: boolean;
  onUpdateOp: (opId: number, data: {type?: string; quantity?: string; unit_price?: string; date?: string; broker?: string; note?: string}) => Promise<void>;
  onDeleteOp: (id: number) => void; onDeleteDiv: (id: number) => void;
}) {
  const [editOp, setEditOp] = useState<Operation | null>(null);
  const [editForm, setEditForm] = useState({ type: "buy", quantity: "", unit_price: "", date: "", broker: "" });
  const [saving, setSaving] = useState(false);

  function startEdit(op: Operation) {
    setEditOp(op);
    setEditForm({
      type: op.type,
      quantity: String(op.quantity),
      unit_price: String(op.unit_price),
      date: String(op.date),
      broker: op.broker ?? "",
    });
  }

  async function saveEdit() {
    if (!editOp) return;
    setSaving(true);
    try {
      await onUpdateOp(editOp.id, {
        type: editForm.type,
        quantity: editForm.quantity,
        unit_price: editForm.unit_price,
        date: editForm.date,
        broker: editForm.broker || undefined,
      });
      setEditOp(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  }

  if (ops.length === 0 && divs.length === 0) {
    return <p className="text-xs text-muted py-2">Nenhuma operação registrada.</p>;
  }

  function fmtQtyLocal(v: string) {
    const n = Number(v);
    return n % 1 === 0 ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  }

  function fmtMoney(v: string | number) {
    return currency === "USD"
      ? Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" })
      : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  return (
    <>
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
                <span className="text-muted flex-1">{fmtQtyLocal(op.quantity)} × {fmtMoney(op.unit_price)}</span>
                <span className="font-medium text-text">{fmtMoney(op.total_amount)}</span>
                {op.broker && <span className="text-muted">{op.broker}</span>}
                {isAdmin && (
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => startEdit(op)} className="text-muted hover:text-text transition-colors" title="Editar">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => onDeleteOp(op.id)} className="text-muted hover:text-danger transition-colors" title="Remover">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
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
                <span className="font-medium text-success">{Number(d.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                {d.note && <span className="text-muted">{d.note}</span>}
                {isAdmin && (
                  <button onClick={() => onDeleteDiv(d.id)} className="ml-auto text-muted hover:text-danger">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    <Modal open={!!editOp} onClose={() => setEditOp(null)} title="Editar Operação">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select
            options={[{ value: "buy", label: "Compra" }, { value: "sell", label: "Venda" }]}
            value={editForm.type}
            onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Quantidade</Label>
            <Input
              type="number" min="0.00000001" step="any"
              value={editForm.quantity}
              onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Preço unitário</Label>
            <Input
              type="number" min="0.01" step="0.01"
              value={editForm.unit_price}
              onChange={e => setEditForm(f => ({ ...f, unit_price: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Data</Label>
            <Input
              type="date"
              value={editForm.date}
              onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Corretora (opcional)</Label>
            <Input
              placeholder="XP, Clear…"
              value={editForm.broker}
              onChange={e => setEditForm(f => ({ ...f, broker: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => setEditOp(null)}>Cancelar</Button>
          <Button onClick={saveEdit} disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : "Atualizar"}
          </Button>
        </div>
      </div>
    </Modal>
    </>
  );
}
