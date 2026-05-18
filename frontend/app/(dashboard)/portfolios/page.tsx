"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, TrendingUp, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
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
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPortfolios(await api.portfolios.list());
    } catch {
      setPortfolios([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
        action={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-1.5" />
            New Portfolio
          </Button>
        }
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
                className="group relative flex cursor-pointer flex-col gap-1 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-2"
                onClick={() => router.push(`/portfolios/${p.id}`)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{p.name}</span>
                  <ChevronRight size={15} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                {p.description && (
                  <p className="text-xs text-muted line-clamp-2">{p.description}</p>
                )}
                <button
                  className="absolute right-2 top-2 hidden rounded p-1 text-muted hover:text-danger group-hover:flex"
                  onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                >
                  <Trash2 size={13} />
                </button>
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
