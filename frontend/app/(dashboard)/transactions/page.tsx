"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
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
  { value: "expense", label: TYPE_LABELS.expense },
  { value: "income", label: TYPE_LABELS.income },
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

  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>(String(CURRENT_YEAR));
  const [filterType, setFilterType] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const loadData = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [txs, cats] = await Promise.all([
        api.transactions.list({
          month: filterMonth ? Number(filterMonth) : undefined,
          year: filterYear ? Number(filterYear) : undefined,
          type: filterType || undefined,
        }),
        api.categories.list(),
      ]);
      setTransactions(txs);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, filterMonth, filterYear, filterType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categoryName = (id: number) =>
    categories.find((c) => c.id === id)?.name ?? "—";

  async function handleCreate() {
    if (!form.category_id || !form.amount || !form.date) {
      setFormError("Category, amount and date are required.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      await api.transactions.create({
        category_id: Number(form.category_id),
        type: form.type,
        amount: form.amount,
        description: form.description || undefined,
        date: form.date,
      });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this transaction?")) return;
    await api.transactions.remove(id);
    loadData();
  }

  const filteredCategories = form.type
    ? categories.filter((c) => c.type === form.type)
    : categories;

  return (
    <div className="flex flex-col gap-6">
      <Header title="Transactions" />

      <div className="flex flex-wrap items-center gap-3">
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
        <Select
          options={TYPE_OPTIONS}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="w-36"
        />
        <div className="ml-auto">
          <Button onClick={() => { setForm(EMPTY_FORM); setFormError(""); setModalOpen(true); }}>
            <Plus size={16} /> New transaction
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 py-12 text-center text-sm text-zinc-500">
          No transactions found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Description</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Category</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-400">Type</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {transactions.map((tx) => (
                <tr key={tx.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                  <td className="px-4 py-3 text-zinc-300">{formatDate(tx.date)}</td>
                  <td className="px-4 py-3 text-zinc-300">{tx.description ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{categoryName(tx.category_id)}</td>
                  <td className="px-4 py-3">
                    <Badge className={TYPE_COLORS[tx.type]}>
                      {TYPE_LABELS[tx.type]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-100">
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Transaction">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
                { value: "investment", label: "Investment" },
              ]}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, category_id: "" }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select
              options={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select category"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Amount (R$)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description (optional)</Label>
            <Input
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {formError && (
            <p className="text-sm text-red-400">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4" /> : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
