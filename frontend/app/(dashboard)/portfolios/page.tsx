"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TrendingUp, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { Portfolio } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export default function PortfoliosPage() {
  const router = useRouter();
  const { isAdmin, currentTenantId } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      setPortfolios(await api.portfolios.list());
    } catch {
      setPortfolios([]);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.portfolios.create({ name: name.trim(), description: description.trim() || undefined });
      toast.success("Portfolio created");
      setShowCreate(false);
      setName("");
      setDescription("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create portfolio");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Portfolio) {
    if (!confirm(`Delete portfolio "${p.name}"? All assets and operations will be lost.`)) return;
    try {
      await api.portfolios.remove(p.id);
      toast.success("Portfolio deleted");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete portfolio");
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header
        title="Portfolios"
        action={isAdmin ? (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1.5" />
            New Portfolio
          </Button>
        ) : undefined}
      />

      <div className="flex flex-col flex-1 overflow-auto px-6 py-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : portfolios.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted">
            <TrendingUp size={36} strokeWidth={1.25} />
            <p className="text-sm">No portfolios yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {portfolios.map((p) => (
              <div
                key={p.id}
                className="group flex cursor-pointer items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-2"
                onClick={() => router.push(`/portfolios/${p.id}`)}
              >
                <div className="flex-1 overflow-hidden">
                  <p className="font-medium text-text truncate">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-muted line-clamp-1 mt-0.5">{p.description}</p>
                  )}
                </div>
                {isAdmin && (
                  <button
                    className="hidden rounded p-1.5 text-muted hover:text-danger group-hover:flex flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
                <ChevronRight size={14} className="text-muted flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Portfolio">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-name">Name</Label>
            <Input
              id="pf-name"
              placeholder="e.g. Carteira Principal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pf-desc">Description (optional)</Label>
            <Input
              id="pf-desc"
              placeholder="Short description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
