"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, FolderPlus, X, Download } from "lucide-react";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, formatDate, MONTHS, TYPE_COLORS, TYPE_LABELS } from "@/lib/utils";
import type { Category, Transaction } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "expense",    label: TYPE_LABELS.expense },
  { value: "income",     label: TYPE_LABELS.income },
  { value: "investment", label: TYPE_LABELS.investment },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({
  value: CURRENT_YEAR - i,
  label: String(CURRENT_YEAR - i),
}));
const MONTH_OPTIONS = [
  { value: "", label: "All months" },
  ...MONTHS.map((m, i) => ({ value: i + 1, label: m })),
];

interface CreateForm {
  category_id: string;
  type: string;
  amount: string;
  description: string;
  date: string;
}

const EMPTY_FORM: CreateForm = {
  category_id: "",
  type: "expense",
  amount: "",
  description: "",
  date: new Date().toISOString().slice(0, 10),
};

export default function TransactionsPage() {
  const { currentTenantId } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterMonth, setFilterMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [filterYear, setFilterYear] = useState<string>(String(CURRENT_YEAR));
  const [filterType, setFilterType] = useState<string>("");

  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [newCatMode, setNewCatMode] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const loadData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [txs, cats] = await Promise.all([
        api.transactions.list({
          month: filterMonth ? Number(filterMonth) : undefined,
          year:  filterYear  ? Number(filterYear)  : undefined,
          type:  filterType  || undefined,
        }),
        api.categories.list(),
      ]);
      setTransactions(txs);
      setCategories(cats);
    } catch {
      // network error
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, filterMonth, filterYear, filterType]);

  useEffect(() => { loadData(); }, [loadData]);

  const categoryName = (id: number) =>
    categories.find((c) => c.id === id)?.name ?? "—";

  async function handleCreate() {
    const needsNewCat = newCatMode && newCatName.trim();
    if (!needsNewCat && !form.category_id) {
      setFormError("Select or create a category.");
      return;
    }
    if (!form.amount || !form.date) {
      setFormError("Amount and date are required.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      let categoryId = Number(form.category_id);
      if (needsNewCat) {
        const cat = await api.categories.create({ name: newCatName.trim(), type: form.type });
        categoryId = cat.id;
      }
      await api.transactions.create({
        category_id: categoryId,
        type:        form.type,
        amount:      form.amount,
        description: form.description || undefined,
        date:        form.date,
      });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setNewCatMode(false);
      setNewCatName("");
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExport(format: "pdf" | "xlsx") {
    setExporting(format);
    const month = filterMonth ? Number(filterMonth) : undefined;
    const year = Number(filterYear);
    try {
      const blob = await api.reports.download(format, year, month);
      const ext = format === "pdf" ? "pdf" : "xlsx";
      const suffix = month ? `${year}_${String(month).padStart(2, "0")}` : String(year);
      downloadBlob(blob, `transactions_${suffix}.${ext}`);
    } finally {
      setExporting(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api.transactions.remove(id);
      await loadData();
    } catch {
      // network error — user can retry
    }
  }

  const filteredCategories = form.type
    ? categories.filter((c) => c.type === form.type)
    : categories;

  return (
    <div className="flex flex-col gap-5">
      <Header title="Transactions" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select options={MONTH_OPTIONS} value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-36" />
        <Select options={YEAR_OPTIONS}  value={filterYear}  onChange={(e) => setFilterYear(e.target.value)}  className="w-28" />
        <Select options={TYPE_OPTIONS}  value={filterType}  onChange={(e) => setFilterType(e.target.value)}  className="w-36" />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => handleExport("xlsx")}
            disabled={exporting !== null}
            title="Export XLSX"
          >
            {exporting === "xlsx" ? <Spinner className="h-3.5 w-3.5" /> : <Download size={14} />}
            XLSX
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            title="Export PDF"
          >
            {exporting === "pdf" ? <Spinner className="h-3.5 w-3.5" /> : <Download size={14} />}
            PDF
          </Button>
          <Button onClick={() => { setForm(EMPTY_FORM); setFormError(""); setNewCatMode(false); setNewCatName(""); setModalOpen(true); }}>
            <Plus size={14} /> New transaction
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-14"><Spinner className="h-7 w-7" /></div>
      ) : transactions.length === 0 ? (
        <div className="rounded-card border border-border py-14 text-center text-sm text-muted">
          No transactions found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => (
                <tr key={tx.id} className="bg-bg hover:bg-surface transition-colors duration-100">
                  <td className="px-4 py-3 text-muted text-sm">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3 text-text">{tx.description ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{categoryName(tx.category_id)}</td>
                  <td className="px-4 py-3">
                    <Badge className={TYPE_COLORS[tx.type]}>{TYPE_LABELS[tx.type]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text tabular">
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(tx.id)} className="text-muted hover:text-danger transition-colors duration-150">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Transaction">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select
              options={[
                { value: "expense",    label: "Expense" },
                { value: "income",     label: "Income" },
                { value: "investment", label: "Investment" },
              ]}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, category_id: "" }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Category</Label>
              <button
                type="button"
                onClick={() => { setNewCatMode((v) => !v); setNewCatName(""); setForm((f) => ({ ...f, category_id: "" })); }}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors"
              >
                {newCatMode ? <><X size={11} /> Use existing</> : <><FolderPlus size={11} /> New category</>}
              </button>
            </div>
            {newCatMode ? (
              <Input
                placeholder="Category name…"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                autoFocus
              />
            ) : (
              <Select
                options={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Select category"
                value={form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Amount (R$)</Label>
            <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Description (optional)</Label>
            <Input placeholder="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4" /> : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
