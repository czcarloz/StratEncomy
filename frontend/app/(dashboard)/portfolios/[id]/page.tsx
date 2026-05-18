"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Gift, ChevronDown, ChevronRight } from "lucide-react";
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

function fmtQty(v: string) {
  const n = Number(v);
  return n % 1 === 0 ? n.toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

export default function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const portfolioId = Number(id);

  const [position, setPosition] = useState<PortfolioPosition | null>(null);
  const [loading, setLoading] = useState(true);

  // expanded asset
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [assetOps, setAssetOps] = useState<Record<number, Operation[]>>({});
  const [assetDivs, setAssetDivs] = useState<Record<number, Dividend[]>>({});

  // modals
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddOp, setShowAddOp] = useState<Asset | null>(null);
  const [showAddDiv, setShowAddDiv] = useState<Asset | null>(null);

  // forms
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
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPosition(await api.portfolios.position(portfolioId));
    } catch {
      setPosition(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => { load(); }, [load]);

  async function toggleAsset(pos: AssetPosition) {
    if (expandedId === pos.asset_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(pos.asset_id);
    if (!assetOps[pos.asset_id]) {
      try {
        const [ops, divs] = await Promise.all([
          api.portfolios.operations(portfolioId, pos.asset_id),
          api.portfolios.dividends(portfolioId),
        ]);
        setAssetOps((prev) => ({ ...prev, [pos.asset_id]: ops }));
        setAssetDivs((prev) => ({
          ...prev,
          [pos.asset_id]: divs.filter((d) => d.asset_id === pos.asset_id),
        }));
      } catch {
        // leave empty
      }
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
      toast.success("Asset added");
      setShowAddAsset(false);
      setTicker(""); setAssetName(""); setAssetClass("stock");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add asset");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOp(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddOp) return;
    setSaving(true);
    try {
      await api.portfolios.addOperation(portfolioId, showAddOp.id, {
        type: opType,
        quantity: qty,
        unit_price: price,
        date: opDate,
        broker: broker.trim() || undefined,
      });
      toast.success("Operation recorded");
      setShowAddOp(null);
      setQty(""); setPrice(""); setBroker("");
      setAssetOps((prev) => ({ ...prev, [showAddOp.id]: [] }));
      setExpandedId(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add operation");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDiv(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddDiv) return;
    setSaving(true);
    try {
      await api.portfolios.addDividend(portfolioId, showAddDiv.id, {
        amount: divAmount,
        date: divDate,
      });
      toast.success("Dividend recorded");
      setShowAddDiv(null);
      setDivAmount("");
      setAssetDivs((prev) => ({ ...prev, [showAddDiv.id]: [] }));
      setExpandedId(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add dividend");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOp(assetId: number, opId: number) {
    try {
      await api.portfolios.removeOperation(portfolioId, assetId, opId);
      setAssetOps((prev) => ({
        ...prev,
        [assetId]: prev[assetId]?.filter((o) => o.id !== opId) ?? [],
      }));
      await load();
      toast.success("Operation deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete operation");
    }
  }

  async function handleDeleteDiv(assetId: number, divId: number) {
    try {
      await api.portfolios.removeDividend(portfolioId, divId);
      setAssetDivs((prev) => ({
        ...prev,
        [assetId]: prev[assetId]?.filter((d) => d.id !== divId) ?? [],
      }));
      await load();
      toast.success("Dividend deleted");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete dividend");
    }
  }

  const title = position ? position.name : "Portfolio";

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title={title}
        action={
          <Button size="sm" onClick={() => setShowAddAsset(true)}>
            <Plus size={14} className="mr-1.5" />
            Add Asset
          </Button>
        }
      />

      <div className="flex flex-col flex-1 overflow-auto px-6 py-5 gap-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center"><Spinner /></div>
        ) : !position ? (
          <p className="text-sm text-muted">Portfolio not found.</p>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SummaryCard label="Total Invested" value={fmt(position.total_invested)} />
              <SummaryCard label="Total Dividends" value={fmt(position.total_dividends)} />
              <SummaryCard label="Assets" value={String(position.positions.length)} plain />
            </div>

            {/* Positions table */}
            {position.positions.length === 0 ? (
              <p className="text-sm text-muted">No positions yet. Add an asset and record a buy operation.</p>
            ) : (
              <div className="rounded-card border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                      <th className="px-4 py-2.5 font-medium">Asset</th>
                      <th className="px-4 py-2.5 font-medium">Class</th>
                      <th className="px-4 py-2.5 font-medium text-right">Quantity</th>
                      <th className="px-4 py-2.5 font-medium text-right">Avg Price</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total Invested</th>
                      <th className="px-4 py-2.5 font-medium text-right">Dividends</th>
                      <th className="px-4 py-2.5 font-medium w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {position.positions.map((pos) => (
                      <>
                        <tr
                          key={pos.asset_id}
                          className="border-b border-border last:border-0 hover:bg-surface/60 cursor-pointer transition-colors"
                          onClick={() => toggleAsset(pos)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {expandedId === pos.asset_id
                                ? <ChevronDown size={13} className="text-muted" />
                                : <ChevronRight size={13} className="text-muted" />
                              }
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
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmt(pos.avg_price)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-medium">{fmt(pos.total_invested)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-success">{fmt(pos.total_dividends)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                title="Buy/Sell"
                                className="rounded p-1.5 text-muted hover:bg-surface hover:text-text transition-colors"
                                onClick={() => {
                                  const a = { id: pos.asset_id, portfolio_id: portfolioId, tenant_id: 0, ticker: pos.ticker, name: pos.name, asset_class: pos.asset_class, created_at: "" };
                                  setShowAddOp(a);
                                }}
                              >
                                <ArrowUpCircle size={14} />
                              </button>
                              <button
                                title="Dividend"
                                className="rounded p-1.5 text-muted hover:bg-surface hover:text-success transition-colors"
                                onClick={() => {
                                  const a = { id: pos.asset_id, portfolio_id: portfolioId, tenant_id: 0, ticker: pos.ticker, name: pos.name, asset_class: pos.asset_class, created_at: "" };
                                  setShowAddDiv(a);
                                }}
                              >
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
                                onDeleteOp={(opId) => handleDeleteOp(pos.asset_id, opId)}
                                onDeleteDiv={(divId) => handleDeleteDiv(pos.asset_id, divId)}
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
        )}
      </div>

      {/* Add Asset Modal */}
      <Modal open={showAddAsset} onClose={() => setShowAddAsset(false)} title="Add Asset">
        <form onSubmit={handleAddAsset} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input id="ticker" placeholder="e.g. PETR4" value={ticker} onChange={(e) => setTicker(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-name">Name (optional)</Label>
            <Input id="asset-name" placeholder="e.g. Petrobras PN" value={assetName} onChange={(e) => setAssetName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-class">Class</Label>
            <Select id="asset-class" value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
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
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <div className="flex gap-2">
              {["buy", "sell"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOpType(t)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-card border py-2 text-sm font-medium transition-colors ${
                    opType === t
                      ? t === "buy" ? "border-primary bg-primary-bg text-primary" : "border-danger bg-danger-bg text-danger"
                      : "border-border text-muted hover:bg-surface"
                  }`}
                >
                  {t === "buy" ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                  {t === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-qty">Quantity</Label>
              <Input id="op-qty" type="number" step="any" min="0" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-price">Unit Price (R$)</Label>
              <Input id="op-price" type="number" step="any" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-date">Date</Label>
              <Input id="op-date" type="date" value={opDate} onChange={(e) => setOpDate(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-broker">Broker (optional)</Label>
              <Input id="op-broker" placeholder="e.g. XP" value={broker} onChange={(e) => setBroker(e.target.value)} />
            </div>
          </div>
          {qty && price && (
            <p className="text-xs text-muted">
              Total: <span className="font-medium text-text">{fmt(String(Number(qty) * Number(price)))}</span>
            </p>
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
              <Label htmlFor="div-amount">Amount (R$)</Label>
              <Input id="div-amount" type="number" step="any" min="0" placeholder="0.00" value={divAmount} onChange={(e) => setDivAmount(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="div-date">Date</Label>
              <Input id="div-date" type="date" value={divDate} onChange={(e) => setDivDate(e.target.value)} required />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAddDiv(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SummaryCard({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-lg font-semibold ${plain ? "text-text" : "text-primary"}`}>{value}</p>
    </div>
  );
}

function OperationHistory({
  ops,
  divs,
  onDeleteOp,
  onDeleteDiv,
}: {
  ops: Operation[];
  divs: Dividend[];
  onDeleteOp: (id: number) => void;
  onDeleteDiv: (id: number) => void;
}) {
  if (ops.length === 0 && divs.length === 0) {
    return <p className="text-xs text-muted py-2">No operations or dividends recorded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {ops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Operations</p>
          <div className="flex flex-col gap-1">
            {ops.map((op) => (
              <div key={op.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2 bg-bg">
                <span className={`font-medium w-8 ${op.type === "buy" ? "text-primary" : "text-danger"}`}>
                  {op.type.toUpperCase()}
                </span>
                <span className="text-muted w-24">{op.date}</span>
                <span className="text-muted">{fmtQty(op.quantity)} × {fmt(op.unit_price)}</span>
                <span className="font-medium text-text w-24 text-right">{fmt(op.total_amount)}</span>
                {op.broker && <span className="text-muted w-20 text-right">{op.broker}</span>}
                <button onClick={() => onDeleteOp(op.id)} className="ml-2 text-muted hover:text-danger">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {divs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted mb-1.5">Dividends</p>
          <div className="flex flex-col gap-1">
            {divs.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs rounded border border-border px-3 py-2 bg-bg">
                <span className="text-success font-medium w-16">DIV</span>
                <span className="text-muted w-24">{d.date}</span>
                <span className="font-medium text-text">{fmt(d.amount)}</span>
                {d.note && <span className="text-muted">{d.note}</span>}
                <button onClick={() => onDeleteDiv(d.id)} className="ml-2 text-muted hover:text-danger">
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
