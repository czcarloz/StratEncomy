"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Category } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

const TYPE_OPTIONS = [
  { value: "expense",    label: "Expense" },
  { value: "income",     label: "Income" },
  { value: "investment", label: "Investment" },
];

const TYPE_BADGE: Record<string, string> = {
  expense:    "bg-danger-bg text-danger",
  income:     "bg-primary-bg text-success",
  investment: "bg-info-bg text-info",
};

const TYPE_LABELS: Record<string, string> = {
  expense: "Expense", income: "Income", investment: "Investment",
};

interface NewForm { name: string; type: string }
const EMPTY_FORM: NewForm = { name: "", type: "expense" };

export default function CategoriesPage() {
  const { currentTenantId } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // inline rename state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // create modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<NewForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      setCategories(await api.categories.list());
    } catch {
      // network error — user can refresh manually
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => { load(); }, [load]);

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    setSavingId(id);
    try {
      await api.categories.update(id, { name: editName.trim() });
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to rename category");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this category?")) return;
    setDeletingId(id);
    try {
      await api.categories.remove(id);
      await load();
      toast.success("Category deleted.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      await api.categories.create({ name: form.name.trim(), type: form.type });
      setModalOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = ["expense", "income", "investment"].map((type) => ({
    type,
    items: categories.filter((c) => c.type === type),
  }));

  return (
    <div className="flex flex-col gap-5">
      <Header title="Categories" />

      <div className="flex justify-end">
        <Button onClick={() => { setForm(EMPTY_FORM); setFormError(""); setModalOpen(true); }}>
          <Plus size={14} /> New category
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Spinner className="h-7 w-7" /></div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map(({ type, items }) => (
            <div key={type}>
              <div className="mb-2 flex items-center gap-2">
                <Badge className={TYPE_BADGE[type]}>{TYPE_LABELS[type]}</Badge>
                <span className="text-xs text-muted">{items.length} {items.length === 1 ? "category" : "categories"}</span>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-muted pl-1">No {TYPE_LABELS[type].toLowerCase()} categories yet.</p>
              ) : (
                <div className="overflow-hidden rounded-card border border-border">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-border">
                      {items.map((cat, i) => (
                        <tr key={cat.id} className={`${i % 2 === 0 ? "bg-bg" : "bg-surface"} hover:bg-surface-2 transition-colors duration-100`}>
                          <td className="px-4 py-3 w-full">
                            {editingId === cat.id ? (
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveEdit(cat.id);
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                autoFocus
                                className="max-w-xs"
                              />
                            ) : (
                              <span className="text-text">{cat.name}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {editingId === cat.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => saveEdit(cat.id)}
                                  disabled={savingId === cat.id}
                                  className="text-success hover:text-success/80 transition-colors p-1"
                                >
                                  {savingId === cat.id ? <Spinner className="h-3.5 w-3.5" /> : <Check size={14} />}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="text-muted hover:text-text transition-colors p-1"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => startEdit(cat)}
                                  className="text-muted hover:text-text transition-colors p-1"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(cat.id)}
                                  disabled={deletingId === cat.id}
                                  className="text-muted hover:text-danger transition-colors p-1 disabled:opacity-40"
                                >
                                  {deletingId === cat.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 size={13} />}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Category">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Type</Label>
            <Select
              options={TYPE_OPTIONS}
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Name</Label>
            <Input
              placeholder="Category name…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              autoFocus
            />
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
