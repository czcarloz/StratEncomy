"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, MONTHS } from "@/lib/utils";
import type { PlannedInvestment, Portfolio } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  value: CURRENT_YEAR - i, label: String(CURRENT_YEAR - i),
}));
const MONTH_OPTIONS = [
  { value: "", label: "All months" },
  ...MONTHS.map((m, i) => ({ value: i + 1, label: m })),
];

interface CreateForm {
  month: string; year: string; asset_label: string;
  amount_planned: string; note: string; portfolio_id: string;
}
const EMPTY_FORM: CreateForm = {
  month: String(new Date().getMonth() + 1), year: String(CURRENT_YEAR),
  asset_label: "", amount_planned: "", note: "", portfolio_id: "",
};

export default function PlannedInvestmentsPage() {
  const { currentTenantId } = useAuth();
  const [entries, setEntries]       = useState<PlannedInvestment[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading]       = useState(true);

  const [filterMonth,     setFilterMonth]     = useState<string>("");
  const [filterYear,      setFilterYear]      = useState<string>(String(CURRENT_YEAR));
  const [filterPortfolio, setFilterPortfolio] = useState<number | null>(null);

  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState("");

  // Load portfolios once
  useEffect(() => {
    api.portfolios.list().then(setPortfolios).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      setEntries(await api.plannedInvestments.list({
        month:        filterMonth     ? Number(filterMonth)     : undefined,
        year:         filterYear      ? Number(filterYear)      : undefined,
        portfolio_id: filterPortfolio ?? undefined,
      }));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [currentTenantId, filterMonth, filterYear, filterPortfolio]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate() {
    if (!form.asset_label || !form.amount_planned || !form.month || !form.year) {
      setFormError("Preencha todos os campos obrigatórios."); return;
    }
    setFormError(""); setSubmitting(true);
    try {
      await api.plannedInvestments.create({
        month:        Number(form.month),
        year:         Number(form.year),
        asset_label:  form.asset_label,
        amount_planned: form.amount_planned,
        note:         form.note || undefined,
        portfolio_id: form.portfolio_id ? Number(form.portfolio_id) : undefined,
      });
      setModalOpen(false); setForm(EMPTY_FORM); loadData();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar");
    } finally { setSubmitting(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Remover este planejamento?")) return;
    await api.plannedInvestments.remove(id);
    loadData();
  }

  const portfolioMap = Object.fromEntries(portfolios.map(p => [p.id, p.name]));

  // Group entries by portfolio for the "Todos" view
  const total = entries.reduce((sum, e) => sum + Number(e.amount_planned), 0);

  // Portfolio filter pill tabs
  const filterTabs: { id: number | null; label: string }[] = [
    { id: null, label: "Todas" },
    ...portfolios.map(p => ({ id: p.id, label: p.name })),
  ];

  const portfolioSelectOptions = [
    { value: "", label: "Sem carteira" },
    ...portfolios.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Header title="Planned Investments" />

      {/* Portfolio filter pills */}
      {portfolios.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filterTabs.map(tab => (
            <button
              key={String(tab.id)}
              onClick={() => setFilterPortfolio(tab.id)}
              className="px-3 py-1.5 rounded-card text-xs font-medium transition-all duration-150"
              style={filterPortfolio === tab.id ? {
                background: "rgba(0,200,150,0.15)",
                border: "1px solid rgba(0,200,150,0.35)",
                color: "#00C896",
              } : {
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "#7890B0",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          options={MONTH_OPTIONS}
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="w-36"
        />
        <Select
          options={YEAR_OPTIONS}
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="w-28"
        />
        {entries.length > 0 && (
          <span className="text-sm text-muted">
            Total:{" "}
            <span className="font-semibold text-text tabular">{formatCurrency(total)}</span>
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={() => { setForm(EMPTY_FORM); setFormError(""); setModalOpen(true); }}>
            <Plus size={14} /> New entry
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-card border border-border py-14 text-center text-sm text-muted">
          Nenhum planejamento encontrado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Período</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Ativo</th>
                {filterPortfolio === null && portfolios.length > 0 && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Carteira</th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Nota</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">Planejado</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="transition-colors duration-100"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td className="px-4 py-3 text-muted">{MONTHS[entry.month - 1]} {entry.year}</td>
                  <td className="px-4 py-3 font-medium text-text">{entry.asset_label}</td>
                  {filterPortfolio === null && portfolios.length > 0 && (
                    <td className="px-4 py-3">
                      {entry.portfolio_id ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: "rgba(0,200,150,0.10)",
                            border: "1px solid rgba(0,200,150,0.20)",
                            color: "#00C896",
                          }}
                        >
                          {portfolioMap[entry.portfolio_id] ?? "—"}
                        </span>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted max-w-xs truncate">{entry.note ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium tabular" style={{ color: "#4A9EFF" }}>
                    {formatCurrency(entry.amount_planned)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="text-muted hover:text-danger transition-colors duration-150"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo Planejamento">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>Mês</Label>
              <Select
                options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
                value={form.month}
                onChange={(e) => setForm(f => ({ ...f, month: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Ano</Label>
              <Select
                options={YEAR_OPTIONS}
                value={form.year}
                onChange={(e) => setForm(f => ({ ...f, year: e.target.value }))}
              />
            </div>
          </div>

          {portfolios.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Carteira (opcional)</Label>
              <Select
                options={portfolioSelectOptions}
                value={form.portfolio_id}
                onChange={(e) => setForm(f => ({ ...f, portfolio_id: e.target.value }))}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Ativo / Label</Label>
            <Input
              placeholder="IVVB11, Tesouro IPCA+…"
              value={form.asset_label}
              onChange={(e) => setForm(f => ({ ...f, asset_label: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Valor planejado (R$)</Label>
            <Input
              type="number" min="0.01" step="0.01" placeholder="0.00"
              value={form.amount_planned}
              onChange={(e) => setForm(f => ({ ...f, amount_planned: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Nota (opcional)</Label>
            <Input
              placeholder="DCA, rebalanceamento…"
              value={form.note}
              onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
            />
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4" /> : "Criar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
