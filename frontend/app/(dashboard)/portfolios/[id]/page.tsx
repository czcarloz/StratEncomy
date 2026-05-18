"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Gift,
  ChevronDown, ChevronRight, Download, Target,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { formatCurrency, MONTHS } from "@/lib/utils";
import type {
  Asset, Dividend, Operation, PortfolioDashboard,
  PortfolioGoal, PortfolioPosition,
} from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary: "#059669", success: "#10B981", danger: "#DC2626",
  info: "#3B82F6", warning: "#F59E0B", muted: "#94A3B8",
  border: "#334155", bg: "#0F172A", surface: "#1E293B",
};
const PIE_COLORS = [C.primary, C.info, C.warning, "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", C.muted];

const ASSET_CLASS_OPTIONS = [
  { value: "stock", label: "Stock (Ação)" }, { value: "fii", label: "FII" },
  { value: "etf", label: "ETF" }, { value: "bdr", label: "BDR" },
  { value: "bond", label: "Renda Fixa" }, { value: "crypto", label: "Crypto" },
  { value: "other", label: "Outro" },
];
const CLASS_BADGE: Record<string, string> = {
  stock: "bg-primary-bg text-primary", fii: "bg-info-bg text-info",
  etf: "bg-primary-bg text-primary", bdr: "bg-surface text-muted",
  bond: "bg-primary-bg text-success", crypto: "bg-info-bg text-info", other: "bg-surface text-muted",
};

type Tab = "positions" | "dashboard" | "goals";

function fmtQty(v: string) {
  const n = Number(v);
  return n % 1 === 0 ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const portfolioId = Number(id);
  const [tab, setTab] = useState<Tab>("positions");

  // data
  const [position, setPosition] = useState<PortfolioPosition | null>(null);
  const [dashboard, setDashboard] = useState<PortfolioDashboard | null>(null);
  const [goals, setGoals] = useState<PortfolioGoal[]>([]);
  const [loading, setLoading] = useState(true);

  // expanded asset rows
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [assetOps, setAssetOps] = useState<Record<number, Operation[]>>({});
  const [assetDivs, setAssetDivs] = useState<Record<number, Dividend[]>>({});

  // modals
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddOp, setShowAddOp] = useState<Asset | null>(null);
  const [showAddDiv, setShowAddDiv] = useState<Asset | null>(null);
  const [showAddGoal, setShowAddGoal] = useState(false);

  // form state
  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetClass, setAssetClass] = useState("stock");
  const [opType, setOpType] = useState("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [opDate, setOpDate] = useState(new Date().toISOString().slice(0, 10));
  const [broker, setBroker] = useState("");
  const [divAmount, setDivAmount] = useState("");
  const [divDate, setDivDate] = useState(new Date().toISOString().slice(0, 10));
  const [goalName, setGoalName] = useState("");
  const [goalPatrimony, setGoalPatrimony] = useState("");
  const [goalDividends, setGoalDividends] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pos, dash, gs] = await Promise.all([
        api.portfolios.position(portfolioId),
        api.portfolios.dashboard(portfolioId),
        api.portfolios.goals(portfolioId),
      ]);
      setPosition(pos);
      setDashboard(dash);
      setGoals(gs);
    } catch {
      setPosition(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { load(); }, [load]);

  async function toggleAsset(assetId: number) {
    if (expandedId === assetId) { setExpandedId(null); return; }
    setExpandedId(assetId);
    if (!assetOps[assetId]) {
      try {
        const [ops, allDivs] = await Promise.all([
          api.portfolios.operations(portfolioId, assetId),
          api.portfolios.dividends(portfolioId),
        ]);
        setAssetOps((p) => ({ ...p, [assetId]: ops }));
        setAssetDivs((p) => ({ ...p, [assetId]: allDivs.filter((d) => d.asset_id === assetId) }));
      } catch { /* leave empty */ }
    }
  }

  async function handleAddAsset(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.portfolios.addAsset(portfolioId, { ticker: ticker.trim().toUpperCase(), name: assetName.trim() || undefined, asset_class: assetClass });
      toast.success("Asset added");
      setShowAddAsset(false); setTicker(""); setAssetName(""); setAssetClass("stock");
      await load();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleAddOp(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddOp) return;
    setSaving(true);
    try {
      await api.portfolios.addOperation(portfolioId, showAddOp.id, { type: opType, quantity: qty, unit_price: price, date: opDate, broker: broker.trim() || undefined });
      toast.success("Operation recorded");
      setShowAddOp(null); setQty(""); setPrice(""); setBroker("");
      setAssetOps((p) => ({ ...p, [showAddOp.id]: [] })); setExpandedId(null);
      await load();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleAddDiv(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddDiv) return;
    setSaving(true);
    try {
      await api.portfolios.addDividend(portfolioId, showAddDiv.id, { amount: divAmount, date: divDate });
      toast.success("Dividend recorded");
      setShowAddDiv(null); setDivAmount("");
      setAssetDivs((p) => ({ ...p, [showAddDiv.id]: [] })); setExpandedId(null);
      await load();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.portfolios.createGoal(portfolioId, {
        name: goalName.trim(),
        patrimony_target: goalPatrimony || undefined,
        dividends_target: goalDividends || undefined,
      });
      toast.success("Goal created");
      setShowAddGoal(false); setGoalName(""); setGoalPatrimony(""); setGoalDividends("");
      await load();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function handleDeleteGoal(goalId: number) {
    try {
      await api.portfolios.removeGoal(portfolioId, goalId);
      setGoals((gs) => gs.filter((g) => g.id !== goalId));
      toast.success("Goal deleted");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function handleDeleteOp(assetId: number, opId: number) {
    try {
      await api.portfolios.removeOperation(portfolioId, assetId, opId);
      setAssetOps((p) => ({ ...p, [assetId]: p[assetId]?.filter((o) => o.id !== opId) ?? [] }));
      await load(); toast.success("Operation deleted");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function handleDeleteDiv(assetId: number, divId: number) {
    try {
      await api.portfolios.removeDividend(portfolioId, divId);
      setAssetDivs((p) => ({ ...p, [assetId]: p[assetId]?.filter((d) => d.id !== divId) ?? [] }));
      await load(); toast.success("Dividend deleted");
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function handleExport(format: "pdf" | "xlsx") {
    try {
      const blob = await api.portfolios.exportReport(portfolioId, format);
      const name = (position?.name ?? "portfolio").replace(/\s+/g, "_").toLowerCase();
      downloadBlob(blob, `portfolio_${name}.${format}`);
    } catch { toast.error("Export failed"); }
  }

  const title = position?.name ?? "Portfolio";

  const TABS: { key: Tab; label: string }[] = [
    { key: "positions", label: "Positions" },
    { key: "dashboard", label: "Dashboard" },
    { key: "goals", label: "Goals" },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={title}
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => handleExport("pdf")}>
              <Download size={13} className="mr-1" /> PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleExport("xlsx")}>
              <Download size={13} className="mr-1" /> XLSX
            </Button>
            {tab === "positions" && (
              <Button size="sm" onClick={() => setShowAddAsset(true)}>
                <Plus size={14} className="mr-1.5" /> Add Asset
              </Button>
            )}
            {tab === "goals" && (
              <Button size="sm" onClick={() => setShowAddGoal(true)}>
                <Plus size={14} className="mr-1.5" /> New Goal
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-6 pt-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col flex-1 overflow-auto px-6 py-5 gap-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : !position ? (
          <p className="text-sm text-muted">Portfolio not found.</p>
        ) : (
          <>
            {tab === "positions" && (
              <PositionsTab
                position={position}
                expandedId={expandedId}
                assetOps={assetOps}
                assetDivs={assetDivs}
                portfolioId={portfolioId}
                onToggle={toggleAsset}
                onAddOp={(pos) => setShowAddOp({ id: pos.asset_id, portfolio_id: portfolioId, tenant_id: 0, ticker: pos.ticker, name: pos.name, asset_class: pos.asset_class, created_at: "" })}
                onAddDiv={(pos) => setShowAddDiv({ id: pos.asset_id, portfolio_id: portfolioId, tenant_id: 0, ticker: pos.ticker, name: pos.name, asset_class: pos.asset_class, created_at: "" })}
                onDeleteOp={handleDeleteOp}
                onDeleteDiv={handleDeleteDiv}
              />
            )}
            {tab === "dashboard" && dashboard && (
              <DashboardTab dashboard={dashboard} />
            )}
            {tab === "goals" && (
              <GoalsTab
                goals={goals}
                totalInvested={Number(position.total_invested)}
                totalDividends={Number(position.total_dividends)}
                onDelete={handleDeleteGoal}
              />
            )}
          </>
        )}
      </div>

      {/* Add Asset Modal */}
      <Modal open={showAddAsset} onClose={() => setShowAddAsset(false)} title="Add Asset">
        <form onSubmit={handleAddAsset} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Ticker</Label>
            <Input placeholder="e.g. PETR4" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Name (optional)</Label>
            <Input placeholder="e.g. Petrobras PN" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Class</Label>
            <Select value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
              {ASSET_CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddAsset(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Adding…" : "Add"}</Button>
          </div>
        </form>
      </Modal>

      {/* Add Operation Modal */}
      <Modal open={!!showAddOp} onClose={() => setShowAddOp(null)} title={`Operation — ${showAddOp?.ticker ?? ""}`}>
        <form onSubmit={handleAddOp} className="flex flex-col gap-4">
          <div className="flex gap-2">
            {["buy", "sell"].map((t) => (
              <button key={t} type="button" onClick={() => setOpType(t)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-card border py-2 text-sm font-medium transition-colors ${opType === t ? (t === "buy" ? "border-primary bg-primary-bg text-primary" : "border-danger bg-danger-bg text-danger") : "border-border text-muted hover:bg-surface"}`}>
                {t === "buy" ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                {t === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Quantity</Label>
              <Input type="number" step="any" min="0" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Unit Price (R$)</Label>
              <Input type="number" step="any" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={opDate} onChange={(e) => setOpDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Broker (optional)</Label>
              <Input placeholder="e.g. XP" value={broker} onChange={(e) => setBroker(e.target.value)} />
            </div>
          </div>
          {qty && price && (
            <p className="text-xs text-muted">Total: <span className="font-medium text-text">{formatCurrency(Number(qty) * Number(price))}</span></p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddOp(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      {/* Add Dividend Modal */}
      <Modal open={!!showAddDiv} onClose={() => setShowAddDiv(null)} title={`Dividend — ${showAddDiv?.ticker ?? ""}`}>
        <form onSubmit={handleAddDiv} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Amount (R$)</Label>
              <Input type="number" step="any" min="0" placeholder="0.00" value={divAmount} onChange={(e) => setDivAmount(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={divDate} onChange={(e) => setDivDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddDiv(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      {/* Add Goal Modal */}
      <Modal open={showAddGoal} onClose={() => setShowAddGoal(false)} title="New Goal">
        <form onSubmit={handleAddGoal} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Goal Name</Label>
            <Input placeholder="e.g. Independência financeira" value={goalName} onChange={(e) => setGoalName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Patrimony Target (R$)</Label>
              <Input type="number" step="any" min="0" placeholder="optional" value={goalPatrimony} onChange={(e) => setGoalPatrimony(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Monthly Dividends Target (R$)</Label>
              <Input type="number" step="any" min="0" placeholder="optional" value={goalDividends} onChange={(e) => setGoalDividends(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddGoal(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ── Positions Tab ─────────────────────────────────────────────────────────────

function PositionsTab({ position, expandedId, assetOps, assetDivs, portfolioId, onToggle, onAddOp, onAddDiv, onDeleteOp, onDeleteDiv }: {
  position: PortfolioPosition;
  expandedId: number | null;
  assetOps: Record<number, Operation[]>;
  assetDivs: Record<number, Dividend[]>;
  portfolioId: number;
  onToggle: (id: number) => void;
  onAddOp: (pos: PortfolioPosition["positions"][0]) => void;
  onAddDiv: (pos: PortfolioPosition["positions"][0]) => void;
  onDeleteOp: (assetId: number, opId: number) => void;
  onDeleteDiv: (assetId: number, divId: number) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Invested" value={formatCurrency(position.total_invested)} />
        <SummaryCard label="Total Dividends" value={formatCurrency(position.total_dividends)} color="text-success" />
        <SummaryCard label="Assets" value={String(position.positions.length)} plain />
      </div>

      {position.positions.length === 0 ? (
        <p className="text-sm text-muted">No positions yet. Add an asset and record a buy operation.</p>
      ) : (
        <div className="rounded-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Class</th>
                <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                <th className="px-4 py-2.5 font-medium text-right">Avg Price</th>
                <th className="px-4 py-2.5 font-medium text-right">Invested</th>
                <th className="px-4 py-2.5 font-medium text-right">Dividends</th>
                <th className="px-4 py-2.5 font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {position.positions.map((pos) => (
                <>
                  <tr key={pos.asset_id} className="border-b border-border last:border-0 hover:bg-surface/60 cursor-pointer transition-colors" onClick={() => onToggle(pos.asset_id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {expandedId === pos.asset_id ? <ChevronDown size={13} className="text-muted" /> : <ChevronRight size={13} className="text-muted" />}
                        <span className="font-semibold text-text">{pos.ticker}</span>
                        {pos.name && <span className="text-xs text-muted">{pos.name}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASS_BADGE[pos.asset_class] ?? "bg-surface text-muted"}`}>
                        {pos.asset_class.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmtQty(pos.quantity)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(pos.avg_price)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-medium">{formatCurrency(pos.total_invested)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-success">{formatCurrency(pos.total_dividends)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button title="Buy/Sell" className="rounded p-1.5 text-muted hover:bg-surface hover:text-text transition-colors" onClick={() => onAddOp(pos)}>
                          <ArrowUpCircle size={14} />
                        </button>
                        <button title="Dividend" className="rounded p-1.5 text-muted hover:bg-surface hover:text-success transition-colors" onClick={() => onAddDiv(pos)}>
                          <Gift size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === pos.asset_id && (
                    <tr key={`${pos.asset_id}-detail`} className="bg-surface/40">
                      <td colSpan={7} className="px-6 pb-4 pt-2">
                        <OperationHistory
                          ops={assetOps[pos.asset_id] ?? []}
                          divs={assetDivs[pos.asset_id] ?? []}
                          onDeleteOp={(opId) => onDeleteOp(pos.asset_id, opId)}
                          onDeleteDiv={(divId) => onDeleteDiv(pos.asset_id, divId)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({ dashboard }: { dashboard: PortfolioDashboard }) {
  const pieData = dashboard.allocation.map((a) => ({
    name: a.asset_class.toUpperCase(),
    value: Number(a.total_invested),
    pct: a.percentage,
  }));

  const barData = dashboard.dividends_by_month.map((d) => ({
    label: `${MONTHS[d.month - 1].slice(0, 3)}/${d.year}`,
    total: Number(d.total),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard label="Total Invested" value={formatCurrency(dashboard.total_invested)} />
        <SummaryCard label="Total Dividends" value={formatCurrency(dashboard.total_dividends)} color="text-success" />
        <SummaryCard label="Asset Classes" value={String(dashboard.allocation.length)} plain />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Allocation pie */}
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text mb-4">Allocation by Class</p>
          {pieData.length === 0 ? (
            <p className="text-xs text-muted">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                  label={({ name, pct }) => `${name} ${pct.toFixed(1)}%`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#F1F5F9" }} itemStyle={{ color: "#94A3B8" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94A3B8" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Dividends bar */}
        <div className="rounded-card border border-border bg-surface p-5">
          <p className="text-sm font-medium text-text mb-4">Dividends by Month</p>
          {barData.length === 0 ? (
            <p className="text-xs text-muted">No dividends recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#F1F5F9" }} itemStyle={{ color: "#94A3B8" }} />
                <Bar dataKey="total" fill={C.success} radius={[4, 4, 0, 0]} name="Dividends" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Goals Tab ─────────────────────────────────────────────────────────────────

function GoalsTab({ goals, totalInvested, totalDividends, onDelete }: {
  goals: PortfolioGoal[];
  totalInvested: number;
  totalDividends: number;
  onDelete: (id: number) => void;
}) {
  if (goals.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted py-16">
        <Target size={36} strokeWidth={1.25} />
        <p className="text-sm">No goals yet. Create one to track your progress.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {goals.map((goal) => (
        <div key={goal.id} className="rounded-card border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-medium text-text">{goal.name}</p>
            <button onClick={() => onDelete(goal.id)} className="text-muted hover:text-danger transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {goal.patrimony_target && (
              <ProgressBar
                label="Patrimony"
                current={totalInvested}
                target={Number(goal.patrimony_target)}
              />
            )}
            {goal.dividends_target && (
              <ProgressBar
                label="Monthly Dividends"
                current={totalDividends}
                target={Number(goal.dividends_target)}
              />
            )}
            {!goal.patrimony_target && !goal.dividends_target && (
              <p className="text-xs text-muted">No targets set for this goal.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = Math.min(100, (current / target) * 100);
  const done = pct >= 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-xs font-medium text-text">
          {formatCurrency(current)} <span className="text-muted">/ {formatCurrency(target)}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? "bg-success" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-muted">{pct.toFixed(1)}%</p>
    </div>
  );
}

// ── Operation History ─────────────────────────────────────────────────────────

function OperationHistory({ ops, divs, onDeleteOp, onDeleteDiv }: {
  ops: Operation[]; divs: Dividend[];
  onDeleteOp: (id: number) => void; onDeleteDiv: (id: number) => void;
}) {
  if (ops.length === 0 && divs.length === 0)
    return <p className="text-xs text-muted py-2">No operations or dividends recorded yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {ops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Operations</p>
          {ops.map((op) => (
            <div key={op.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2 bg-bg mb-1">
              <span className={`font-medium w-8 ${op.type === "buy" ? "text-primary" : "text-danger"}`}>{op.type.toUpperCase()}</span>
              <span className="text-muted w-24">{op.date}</span>
              <span className="text-muted">{fmtQty(op.quantity)} × {formatCurrency(op.unit_price)}</span>
              <span className="font-medium text-text w-24 text-right">{formatCurrency(op.total_amount)}</span>
              {op.broker && <span className="text-muted w-20 text-right">{op.broker}</span>}
              <button onClick={() => onDeleteOp(op.id)} className="ml-2 text-muted hover:text-danger"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
      {divs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Dividends</p>
          {divs.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2 bg-bg mb-1">
              <span className="text-success font-medium w-16">DIV</span>
              <span className="text-muted w-24">{d.date}</span>
              <span className="font-medium text-text">{formatCurrency(d.amount)}</span>
              {d.note && <span className="text-muted">{d.note}</span>}
              <button onClick={() => onDeleteDiv(d.id)} className="ml-2 text-muted hover:text-danger"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, plain, color }: { label: string; value: string; plain?: boolean; color?: string }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-lg font-semibold ${color ?? (plain ? "text-text" : "text-primary")}`}>{value}</p>
    </div>
  );
}
