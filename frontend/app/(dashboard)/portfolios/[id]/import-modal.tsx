"use client";

import { useRef, useState } from "react";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import type { B3ParsedDividend, B3ParsedOperation, B3PreviewResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

function fmt(v: string | number) {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Step = "upload" | "preview" | "done";

interface Props {
  portfolioId: number;
  onClose: () => void;
  onImported: () => void;
}

export function B3ImportModal({ portfolioId, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<B3PreviewResult | null>(null);
  const [tab, setTab] = useState<"ops" | "divs">("ops");

  // selection state — true = selected for import
  const [selOps, setSelOps] = useState<boolean[]>([]);
  const [selDivs, setSelDivs] = useState<boolean[]>([]);

  const [result, setResult] = useState<{ ops: number; divs: number; assets: number } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const data = await api.b3Import.preview(portfolioId, file);
      setPreview(data);
      setSelOps(data.operations.map(() => true));
      setSelDivs(data.dividends.map(() => true));
      setStep("preview");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar arquivo");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    const ops  = preview.operations.filter((_, i) => selOps[i]);
    const divs = preview.dividends.filter((_, i) => selDivs[i]);
    if (ops.length === 0 && divs.length === 0) {
      toast.error("Nenhum item selecionado para importar.");
      return;
    }
    setLoading(true);
    try {
      const r = await api.b3Import.confirm(portfolioId, ops, divs);
      setResult({ ops: r.operations_created, divs: r.dividends_created, assets: r.assets_created });
      setStep("done");
      onImported();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao importar");
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(type: "ops" | "divs", value: boolean) {
    if (type === "ops") setSelOps((prev) => prev.map(() => value));
    else setSelDivs((prev) => prev.map(() => value));
  }

  const selectedOpsCount  = selOps.filter(Boolean).length;
  const selectedDivsCount = selDivs.filter(Boolean).length;

  return (
    <Modal
      open
      onClose={onClose}
      title="Importar da B3"
    >
      {/* ── Step: upload ── */}
      {step === "upload" && (
        <div className="flex flex-col items-center gap-5 py-6">
          <div className="rounded-full bg-primary-bg p-4">
            <Upload size={28} className="text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-text mb-1">Extrato de Movimentações da B3</p>
            <p className="text-xs text-muted">
              Acesse <span className="font-medium text-text">investidor.b3.com.br</span> →<br />
              Extratos → Movimentações → Exportar Excel
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={loading}>
            {loading ? <><Spinner className="mr-2 h-4 w-4" /> Processando…</> : "Selecionar arquivo .xlsx"}
          </Button>
        </div>
      )}

      {/* ── Step: preview ── */}
      {step === "preview" && preview && (
        <div className="flex flex-col gap-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatChip label="Operações" value={preview.operations.length} color="text-primary" />
            <StatChip label="Dividendos" value={preview.dividends.length} color="text-success" />
            <StatChip label="Ignorados" value={preview.skipped_count} color="text-muted" />
          </div>

          {/* Skipped reasons */}
          {preview.skipped_reasons.length > 0 && (
            <div className="flex items-start gap-2 rounded-card border border-border bg-surface px-3 py-2 text-xs text-muted">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                Tipos ignorados:{" "}
                <span className="text-text">{preview.skipped_reasons.join(", ")}</span>
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["ops", "divs"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t
                    ? "border-b-2 border-primary text-primary -mb-px"
                    : "text-muted hover:text-text"
                }`}
              >
                {t === "ops"
                  ? `Operações (${selectedOpsCount}/${preview.operations.length})`
                  : `Dividendos (${selectedDivsCount}/${preview.dividends.length})`}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="max-h-72 overflow-auto rounded-card border border-border">
            {tab === "ops" ? (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selOps.every(Boolean)}
                        onChange={(e) => toggleAll("ops", e.target.checked)}
                      />
                    </th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Preço</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Corretora</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.operations.map((op, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-0 ${selOps[i] ? "" : "opacity-40"}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selOps[i]}
                          onChange={(e) =>
                            setSelOps((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold text-text">{op.ticker}</td>
                      <td className={`px-3 py-2 font-medium ${op.op_type === "buy" ? "text-primary" : "text-danger"}`}>
                        {op.op_type === "buy" ? "COMPRA" : "VENDA"}
                      </td>
                      <td className="px-3 py-2 text-muted">{op.date}</td>
                      <td className="px-3 py-2 text-right font-mono">{Number(op.quantity).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(op.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        {fmt(String(Number(op.quantity) * Number(op.unit_price)))}
                      </td>
                      <td className="px-3 py-2 text-muted">{op.broker ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selDivs.every(Boolean)}
                        onChange={(e) => toggleAll("divs", e.target.checked)}
                      />
                    </th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.dividends.map((div, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border last:border-0 ${selDivs[i] ? "" : "opacity-40"}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selDivs[i]}
                          onChange={(e) =>
                            setSelDivs((prev) => prev.map((v, j) => (j === i ? e.target.checked : v)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold text-text">{div.ticker}</td>
                      <td className="px-3 py-2 text-muted">{div.date}</td>
                      <td className="px-3 py-2 text-right font-mono text-success">{fmt(div.amount)}</td>
                      <td className="px-3 py-2 text-muted">{div.note ?? "Rendimento"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted">
              {selectedOpsCount + selectedDivsCount} itens selecionados
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? <><Spinner className="mr-2 h-4 w-4" /> Importando…</> : "Confirmar importação"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step: done ── */}
      {step === "done" && result && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="rounded-full bg-primary-bg p-4">
            <CheckCircle2 size={28} className="text-primary" />
          </div>
          <p className="text-sm font-medium text-text">Importação concluída!</p>
          <div className="grid grid-cols-3 gap-3 w-full">
            <StatChip label="Operações" value={result.ops} color="text-primary" />
            <StatChip label="Dividendos" value={result.divs} color="text-success" />
            <StatChip label="Ativos criados" value={result.assets} color="text-info" />
          </div>
          {result.assets > 0 && (
            <p className="text-xs text-muted">
              {result.assets} ativo{result.assets !== 1 ? "s" : ""} criado{result.assets !== 1 ? "s" : ""} automaticamente.
              Você pode ajustar a classe (Stock/FII/ETF…) em cada ativo.
            </p>
          )}
          <Button onClick={onClose}>Fechar</Button>
        </div>
      )}
    </Modal>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
