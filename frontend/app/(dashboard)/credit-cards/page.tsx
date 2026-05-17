"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, CreditCard as CardIcon, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, formatDate, MONTHS } from "@/lib/utils";
import type { CreditCard, Invoice } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => ({ value: CURRENT_YEAR - i, label: String(CURRENT_YEAR - i) }));
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

// ── Create Card Modal ──────────────────────────────────────────────────────

function CreateCardModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [closingDay, setClosingDay] = useState("10");
  const [dueDay, setDueDay] = useState("17");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!name || !closingDay || !dueDay) { setError("Name, closing day and due day are required."); return; }
    setError(""); setLoading(true);
    try {
      await api.creditCards.create({ name, closing_day: Number(closingDay), due_day: Number(dueDay), limit: limit || undefined });
      setName(""); setClosingDay("10"); setDueDay("17"); setLimit("");
      onCreated(); onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Credit Card">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2"><Label>Name</Label><Input placeholder="Nubank, XP Visa…" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2"><Label>Closing day</Label><Input type="number" min="1" max="28" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label>Due day</Label><Input type="number" min="1" max="28" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></div>
        </div>
        <div className="flex flex-col gap-2"><Label>Limit (optional)</Label><Input type="number" min="0" step="0.01" placeholder="0.00" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? <Spinner className="h-4 w-4" /> : "Create"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Add Purchase Modal ──────────────────────────────────────────────────────

function AddPurchaseModal({ cardId, open, onClose, onCreated }: { cardId: number; open: boolean; onClose: () => void; onCreated: () => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [installments, setInstallments] = useState("1");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!description || !amount || !purchaseDate) { setError("All fields are required."); return; }
    setError(""); setLoading(true);
    try {
      await api.creditCards.addPurchase(cardId, { description, total_amount: amount, installments: Number(installments), purchase_date: purchaseDate });
      setDescription(""); setAmount(""); setInstallments("1");
      onCreated(); onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Purchase">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2"><Label>Description</Label><Input placeholder="Amazon, Netflix…" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2"><Label>Total amount (R$)</Label><Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label>Installments</Label><Input type="number" min="1" max="48" value={installments} onChange={(e) => setInstallments(e.target.value)} /></div>
        </div>
        <div className="flex flex-col gap-2"><Label>Purchase date</Label><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>{loading ? <Spinner className="h-4 w-4" /> : "Add"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Card Detail ─────────────────────────────────────────────────────────────

function CardDetail({ card, onBack, onDeleteCard }: { card: CreditCard; onBack: () => void; onDeleteCard: () => void }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [purchaseModal, setPurchaseModal] = useState(false);

  const loadInvoice = useCallback(async () => {
    setLoadingInvoice(true);
    try { setInvoice(await api.creditCards.invoice(card.id, month, year)); }
    finally { setLoadingInvoice(false); }
  }, [card.id, month, year]);

  useEffect(() => { loadInvoice(); }, [loadInvoice]);

  async function handleDeletePurchase(purchaseId: number) {
    if (!confirm("Remove this purchase?")) return;
    await api.creditCards.removePurchase(card.id, purchaseId);
    loadInvoice();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="text-muted hover:text-text transition-colors text-sm">← Cards</button>
        <ChevronRight size={13} className="text-border" />
        <span className="text-text font-medium text-sm">{card.name}</span>
        <span className="text-muted text-xs ml-1">
          Closes {card.closing_day} · Due {card.due_day}{card.limit ? ` · Limit ${formatCurrency(card.limit)}` : ""}
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" onClick={() => setPurchaseModal(true)}><Plus size={13} /> Add purchase</Button>
          <Button variant="danger" size="sm" onClick={onDeleteCard}><Trash2 size={13} /> Delete card</Button>
        </div>
      </div>

      {/* Month/Year filter + total */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select options={MONTH_OPTIONS} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-36" />
        <Select options={YEAR_OPTIONS}  value={year}  onChange={(e) => setYear(Number(e.target.value))}  className="w-28" />
        {invoice && (
          <div className="ml-auto text-sm text-muted">
            Invoice total: <span className="font-semibold text-text tabular">{formatCurrency(invoice.total)}</span>
          </div>
        )}
      </div>

      {/* Invoice table */}
      {loadingInvoice ? (
        <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
      ) : !invoice || invoice.items.length === 0 ? (
        <div className="rounded-card border border-border py-10 text-center text-sm text-muted">No installments for this month.</div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Purchase date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wide">Installment</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wide">Amount</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoice.items.map((item) => (
                <tr key={`${item.purchase_id}-${item.installment_number}`} className="bg-bg hover:bg-surface transition-colors duration-100">
                  <td className="px-4 py-3 text-muted">{formatDate(item.purchase_date)}</td>
                  <td className="px-4 py-3 text-text">{item.description}</td>
                  <td className="px-4 py-3">
                    <Badge className="bg-info-bg text-info">{item.installment_number}/{item.installments}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text tabular">{formatCurrency(item.installment_amount)}</td>
                  <td className="px-4 py-3 text-right">
                    {item.installment_number === 1 && (
                      <button onClick={() => handleDeletePurchase(item.purchase_id)} className="text-muted hover:text-danger transition-colors duration-150"><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddPurchaseModal cardId={card.id} open={purchaseModal} onClose={() => setPurchaseModal(false)} onCreated={loadInvoice} />
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function CreditCardsPage() {
  const { currentTenantId } = useAuth();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);

  const loadCards = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try { setCards(await api.creditCards.list()); }
    finally { setLoading(false); }
  }, [currentTenantId]);

  useEffect(() => { loadCards(); }, [loadCards]);

  async function handleDeleteCard(card: CreditCard) {
    if (!confirm(`Delete card "${card.name}"? All purchases will be removed.`)) return;
    await api.creditCards.remove(card.id);
    setSelectedCard(null);
    loadCards();
  }

  if (selectedCard) {
    return (
      <div className="flex flex-col gap-5">
        <Header title="Credit Cards" />
        <CardDetail card={selectedCard} onBack={() => setSelectedCard(null)} onDeleteCard={() => handleDeleteCard(selectedCard)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Header title="Credit Cards" />

      <div className="flex justify-end">
        <Button onClick={() => setCreateModal(true)}><Plus size={14} /> New card</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
      ) : cards.length === 0 ? (
        <div className="rounded-card border border-border py-14 text-center text-sm text-muted">No credit cards yet.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => setSelectedCard(card)}
              className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 text-left transition-colors duration-150 hover:border-primary hover:bg-surface-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-card bg-primary-bg text-primary flex-shrink-0">
                <CardIcon size={16} strokeWidth={1.75} />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="font-medium text-text text-sm truncate">{card.name}</p>
                <p className="text-xs text-muted">
                  Closes {card.closing_day} · Due {card.due_day}{card.limit ? ` · ${formatCurrency(card.limit)}` : ""}
                </p>
              </div>
              <ChevronRight size={14} className="text-border flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <CreateCardModal open={createModal} onClose={() => setCreateModal(false)} onCreated={loadCards} />
    </div>
  );
}
