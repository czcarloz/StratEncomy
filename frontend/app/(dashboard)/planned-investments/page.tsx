"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, MONTHS } from "@/lib/utils";
import type { PlannedInvestment } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({ value: CURRENT_YEAR - i, label: String(CURRENT_YEAR - i) }));
const MONTH_OPTIONS = [
  { value: "", label: "All months" },
  ...MONTHS.map((m, i) => ({ value: i + 1, label: m })),
];

interface CreateForm {
  month: string; year: string; asset_label: string; amount_planned: string; note: string;
}
const EMPTY_FORM: CreateForm = {
  month: String(new Date().getMonth() + 1), year: String(CURRENT_YEAR),
  asset_label: "", amount_planned: "", note: "",
};

export default function PlannedInvestmentsPage() {
  const { currentTenantId } = useAuth();
  const [entries, setEntries] = useState<PlannedInvestment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>(String(CURRENT_YEAR));
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const loadData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      setEntries(await api.plannedInvestments.list({
        month: filterMonth ? Number(filterMonth) : undefined,
        year:  filterYear  ? Number(filterYear)  : undefined,
      }));
    } catch {
      // network error
    } finally { setLoading(false); }
  }, [currentTenantId, filterMonth, filterYear]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate() {
    if (!form.asset_label || !form.amount_planned || !form.month || !form.year) {
      setFormError("All fields except note are required."); return;
    }
    setFormError(""); setSubmitting(true);
    try {
      await api.plannedInvestments.create({
        month: Number(form.month), year: Number(form.year),
        asset_label: form.asset_label, amount_planned: form.amount_planned,
        note: form.note || undefined,
      });
      setModalOpen(false); setForm(EMPTY_FORM); loadData();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : "Failed"); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remove this planned investment?")) return;
    await api.plannedInvestments.remove(id);
    loadData();
  }

  const total = entries.reduce((sum, e) => sum + Number(e.amount_planned), 0);

  return (
    <div className="flex flex-col gap-5">
      <Header title="Planned Investments" />

      <div className="flex flex-wrap items-center gap-2">
        <Select options={MONTH_OPTIONS} value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-36" />
        <Select options={YEAR_OPTIONS}  value={filterYear}  onChange={(e) => setFilterYear(e.target.value)}  className="w-28" />
        {entries.length > 0 && (
          <span className="text-sm text-muted">
            Total: <span className="font-semibold text-text tabular">{formatCurrency(total)}</span>
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={() => { setForm(EMPTY_FORM); setFormError(""); setModalOpen(true); }}>
            <Plus size={14} /> New entry
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-card border border-border py-14 text-center text-sm text-muted">No planned investments found.</div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Asset</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Note</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">Planned</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="bg-bg hover:bg-surface transition-colors duration-100">
                  <td className="px-4 py-3 text-muted">{MONTHS[entry.month - 1]} {entry.year}</td>
                  <td className="px-4 py-3 font-medium text-text">{entry.asset_label}</td>
                  <td className="px-4 py-3 text-muted max-w-xs truncate">{entry.note ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-info tabular">{formatCurrency(entry.amount_planned)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(entry.id)} className="text-muted hover:text-danger transition-colors duration-150"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Planned Investment">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Month</Label>
              <Select options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Year</Label>
              <Select options={YEAR_OPTIONS} value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-2"><Label>Asset / label</Label><Input placeholder="IVVB11, Tesouro IPCA+…" value={form.asset_label} onChange={(e) => setForm((f) => ({ ...f, asset_label: e.target.value }))} /></div>
          <div className="flex flex-col gap-2"><Label>Planned amount (R$)</Label><Input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount_planned} onChange={(e) => setForm((f) => ({ ...f, amount_planned: e.target.value }))} /></div>
          <div className="flex flex-col gap-2"><Label>Note (optional)</Label><Input placeholder="DCA, rebalancing…" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></div>
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? <Spinner className="h-4 w-4" /> : "Create"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
