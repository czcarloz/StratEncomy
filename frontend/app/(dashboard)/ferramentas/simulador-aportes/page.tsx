"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, RefreshCw, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { FinancialGoal, PlanPhase } from "@/types";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTH_OPTIONS = MONTHS_SHORT.map((m, i) => ({ value: i + 1, label: m }));
const CUR_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => ({ value: CUR_YEAR + i, label: String(CUR_YEAR + i) }));

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtBRLDec(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Simulation engine ──────────────────────────────────────────────────────────

interface Phase { start_year: number; start_month: number; salary: number; aporte: number; gasto_maximo: number }
interface SemRow  { year: number; sem: 1 | 2; salary: number; aporte: number; gasto_maximo: number; patrimony: number }

function getActivePhase(phases: Phase[], year: number, month: number): Phase | null {
  const sorted = [...phases].sort((a, b) =>
    a.start_year !== b.start_year ? a.start_year - b.start_year : a.start_month - b.start_month
  );
  let active: Phase | null = null;
  for (const p of sorted) {
    if (p.start_year < year || (p.start_year === year && p.start_month <= month)) {
      active = p;
    }
  }
  return active;
}

function simulate(initial: number, monthlyRate: number, horizonYears: number, phases: Phase[]): SemRow[] {
  if (phases.length === 0) return [];

  // Começa sempre a partir da fase mais antiga, não da data de hoje
  const sorted = [...phases].sort((a, b) =>
    a.start_year !== b.start_year ? a.start_year - b.start_year : a.start_month - b.start_month
  );
  const firstPhase  = sorted[0];
  const startYear   = firstPhase.start_year;
  const startMonth  = firstPhase.start_month;
  const endYear     = startYear + horizonYears;

  const rows: SemRow[] = [];
  let patrimony = initial;

  for (let y = startYear; y < endYear; y++) {
    for (const sem of [1, 2] as const) {
      const allMonths = sem === 1 ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
      // No primeiro ano/semestre, pula os meses anteriores à fase inicial
      const months = (y === startYear)
        ? allMonths.filter(m => m >= startMonth)
        : allMonths;

      if (months.length === 0) continue;

      let semSalary = 0, semAporte = 0, semGasto = 0, hasPhase = false;

      for (const m of months) {
        const phase = getActivePhase(phases, y, m);
        if (phase) {
          semSalary = phase.salary;
          semAporte = phase.aporte;
          semGasto  = phase.gasto_maximo;
          hasPhase  = true;
          patrimony = patrimony * (1 + monthlyRate) + phase.aporte;
        } else {
          patrimony = patrimony * (1 + monthlyRate);
        }
      }

      if (hasPhase || rows.length > 0) {
        rows.push({ year: y, sem, salary: semSalary, aporte: semAporte, gasto_maximo: semGasto, patrimony });
      }
    }
  }
  return rows;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SimuladorAportesPage() {
  const { currentTenantId } = useAuth();

  const [activeTab, setActiveTab] = useState<"simulador" | "metas">("simulador");

  // ── Config state ────────────────────────────────────────────────────────────
  const [initPatrimony, setInitPatrimony] = useState("0");
  const [monthlyRate,   setMonthlyRate]   = useState("1.0");
  const [horizonYears,  setHorizonYears]  = useState("3");
  const [configLoading, setConfigLoading] = useState(false);

  // ── Phases state ────────────────────────────────────────────────────────────
  const [phases,       setPhases]       = useState<PlanPhase[]>([]);
  const [phasesLoading, setPhasesLoading] = useState(true);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [editingPhase,   setEditingPhase]   = useState<PlanPhase | null>(null);
  const [phaseForm, setPhaseForm] = useState({
    start_year: String(CUR_YEAR), start_month: String(new Date().getMonth() + 1),
    salary: "", aporte: "", gasto_maximo: "", note: "",
  });

  // ── Goals state ─────────────────────────────────────────────────────────────
  const [goals,       setGoals]       = useState<FinancialGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal,   setEditingGoal]   = useState<FinancialGoal | null>(null);
  const [goalForm, setGoalForm] = useState({
    description: "", target_date: "", target_amount: "", actual_amount: "", note: "",
  });
  const [savingGoal,  setSavingGoal]  = useState(false);
  const [savingPhase, setSavingPhase] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!currentTenantId) return;
    setPhasesLoading(true); setGoalsLoading(true);
    try {
      const [cfg, ph, gl] = await Promise.all([
        api.financialPlan.getConfig(),
        api.financialPlan.listPhases(),
        api.financialPlan.listGoals(),
      ]);
      setInitPatrimony(String(Number(cfg.initial_patrimony)));
      setMonthlyRate(String(Number(cfg.monthly_rate) * 100));
      setHorizonYears(String(cfg.horizon_years));
      setPhases(ph);
      setGoals(gl);
    } catch { /* ignore */ }
    finally { setPhasesLoading(false); setGoalsLoading(false); }
  }, [currentTenantId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Auto-fetch patrimônio from portfolios ────────────────────────────────────
  async function fetchPatrimony() {
    setConfigLoading(true);
    try {
      const portfolios = await api.portfolios.list();
      let total = 0;
      for (const p of portfolios) {
        const pos = await api.portfolios.position(p.id).catch(() => null);
        if (pos) total += Number(pos.total_invested);
      }
      setInitPatrimony(total.toFixed(2));
      toast.success("Patrimônio buscado dos portfólios");
    } catch { toast.error("Erro ao buscar patrimônio"); }
    finally { setConfigLoading(false); }
  }

  // ── Save config ──────────────────────────────────────────────────────────────
  async function saveConfig() {
    setConfigLoading(true);
    try {
      await api.financialPlan.saveConfig({
        initial_patrimony: initPatrimony,
        monthly_rate: String(Number(monthlyRate) / 100),
        horizon_years: Number(horizonYears),
      });
      toast.success("Configuração salva");
    } catch { toast.error("Erro ao salvar"); }
    finally { setConfigLoading(false); }
  }

  // ── Phase CRUD ────────────────────────────────────────────────────────────────
  function openAddPhase() {
    setEditingPhase(null);
    setPhaseForm({ start_year: String(CUR_YEAR), start_month: String(new Date().getMonth() + 1), salary: "", aporte: "", gasto_maximo: "", note: "" });
    setShowPhaseModal(true);
  }
  function openEditPhase(p: PlanPhase) {
    setEditingPhase(p);
    setPhaseForm({ start_year: String(p.start_year), start_month: String(p.start_month), salary: String(p.salary), aporte: String(p.aporte), gasto_maximo: String(p.gasto_maximo), note: p.note ?? "" });
    setShowPhaseModal(true);
  }
  async function savePhase() {
    if (!phaseForm.salary || !phaseForm.aporte || !phaseForm.gasto_maximo) {
      toast.error("Preencha salário, aporte e gasto máximo"); return;
    }
    setSavingPhase(true);
    try {
      const data = { start_year: Number(phaseForm.start_year), start_month: Number(phaseForm.start_month), salary: phaseForm.salary, aporte: phaseForm.aporte, gasto_maximo: phaseForm.gasto_maximo, note: phaseForm.note || undefined };
      if (editingPhase) {
        await api.financialPlan.updatePhase(editingPhase.id, data);
      } else {
        await api.financialPlan.createPhase(data);
      }
      setShowPhaseModal(false);
      const ph = await api.financialPlan.listPhases();
      setPhases(ph);
      toast.success(editingPhase ? "Fase atualizada" : "Fase criada");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSavingPhase(false); }
  }
  async function deletePhase(id: number) {
    if (!confirm("Remover esta fase?")) return;
    await api.financialPlan.deletePhase(id);
    setPhases(prev => prev.filter(p => p.id !== id));
    toast.success("Fase removida");
  }

  // ── Goal CRUD ─────────────────────────────────────────────────────────────────
  function openAddGoal() {
    setEditingGoal(null);
    setGoalForm({ description: "", target_date: "", target_amount: "", actual_amount: "", note: "" });
    setShowGoalModal(true);
  }
  function openEditGoal(g: FinancialGoal) {
    setEditingGoal(g);
    setGoalForm({ description: g.description, target_date: g.target_date, target_amount: String(g.target_amount), actual_amount: g.actual_amount ? String(g.actual_amount) : "", note: g.note ?? "" });
    setShowGoalModal(true);
  }
  async function saveGoal() {
    if (!goalForm.description || !goalForm.target_date || !goalForm.target_amount) {
      toast.error("Preencha descrição, data e valor"); return;
    }
    setSavingGoal(true);
    try {
      const data = { description: goalForm.description, target_date: goalForm.target_date, target_amount: goalForm.target_amount, actual_amount: goalForm.actual_amount || undefined, note: goalForm.note || undefined };
      if (editingGoal) {
        const updated = await api.financialPlan.updateGoal(editingGoal.id, data);
        setGoals(prev => prev.map(g => g.id === updated.id ? updated : g));
      } else {
        const created = await api.financialPlan.createGoal(data);
        setGoals(prev => [...prev, created].sort((a,b) => a.target_date.localeCompare(b.target_date)));
      }
      setShowGoalModal(false);
      toast.success(editingGoal ? "Meta atualizada" : "Meta criada");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setSavingGoal(false); }
  }
  async function deleteGoal(id: number) {
    if (!confirm("Remover esta meta?")) return;
    await api.financialPlan.deleteGoal(id);
    setGoals(prev => prev.filter(g => g.id !== id));
    toast.success("Meta removida");
  }

  // ── Simulation ─────────────────────────────────────────────────────────────
  const simRows = useMemo(() => {
    const init  = Number(initPatrimony) || 0;
    const rate  = (Number(monthlyRate) || 0) / 100;
    const years = Number(horizonYears) || 3;
    if (phases.length === 0) return [];
    const mapped: Phase[] = phases.map(p => ({
      start_year: p.start_year, start_month: p.start_month,
      salary: Number(p.salary), aporte: Number(p.aporte), gasto_maximo: Number(p.gasto_maximo),
    }));
    return simulate(init, rate, years, mapped);
  }, [initPatrimony, monthlyRate, horizonYears, phases]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header title="Simulador de Aportes & Metas" />

      <div className="flex flex-col flex-1 overflow-auto px-1 py-4 gap-5">

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["simulador", "metas"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {tab === "simulador" ? "Simulador" : "Metas"}
            </button>
          ))}
        </div>

        {/* ── TAB: SIMULADOR ── */}
        {activeTab === "simulador" && (
          <>
            {/* Config card */}
            <div className="rounded-card border border-border bg-surface p-5">
              <p className="text-sm font-semibold text-text mb-4">Configuração</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5 lg:col-span-2">
                  <Label>Patrimônio atual (R$)</Label>
                  <div className="flex gap-2">
                    <Input type="number" min="0" step="any" placeholder="0,00"
                      value={initPatrimony} onChange={e => setInitPatrimony(e.target.value)}
                      className="flex-1"
                    />
                    <button
                      onClick={fetchPatrimony}
                      disabled={configLoading}
                      title="Buscar total investido dos portfólios"
                      className="px-3 rounded-input text-muted hover:text-primary transition-colors disabled:opacity-40"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
                    >
                      <RefreshCw size={14} className={configLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Taxa de retorno (% a.m.)</Label>
                  <Input type="number" min="0" max="20" step="0.01" placeholder="1.0"
                    value={monthlyRate} onChange={e => setMonthlyRate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Horizonte (anos)</Label>
                  <Input type="number" min="1" max="30" step="1" placeholder="3"
                    value={horizonYears} onChange={e => setHorizonYears(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button onClick={saveConfig} disabled={configLoading} size="sm">
                  {configLoading ? <Spinner className="h-4 w-4" /> : <><Check size={13} /> Salvar config</>}
                </Button>
              </div>
            </div>

            {/* Phases card */}
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-text">Fases Salariais</p>
                <Button size="sm" onClick={openAddPhase}><Plus size={13} /> Adicionar fase</Button>
              </div>

              {phasesLoading ? (
                <div className="flex justify-center py-6"><Spinner /></div>
              ) : phases.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">
                  Adicione uma fase para definir salário, aporte e gasto máximo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["A partir de","Salário","Aporte","Gasto Máx.","Nota",""].map(h => (
                          <th key={h} className={`pb-2.5 text-xs font-medium text-muted uppercase tracking-wide ${h === "" ? "" : "text-left"} ${["Salário","Aporte","Gasto Máx."].includes(h) ? "text-right" : ""}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {phases.map(p => (
                        <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="py-2.5 font-medium text-text">
                            {MONTHS_SHORT[p.start_month - 1]}/{p.start_year}
                          </td>
                          <td className="py-2.5 text-right font-mono text-xs text-muted">{fmtBRLDec(Number(p.salary))}</td>
                          <td className="py-2.5 text-right font-mono text-xs" style={{ color: "#00C896" }}>{fmtBRLDec(Number(p.aporte))}</td>
                          <td className="py-2.5 text-right font-mono text-xs text-muted">{fmtBRLDec(Number(p.gasto_maximo))}</td>
                          <td className="py-2.5 text-xs text-muted max-w-[160px] truncate pl-4">{p.note ?? "—"}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditPhase(p)} className="p-1.5 text-muted hover:text-text transition-colors rounded"><Pencil size={12} /></button>
                              <button onClick={() => deletePhase(p.id)} className="p-1.5 text-muted hover:text-danger transition-colors rounded"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Projection table */}
            {simRows.length > 0 && (
              <div className="rounded-card border border-border overflow-hidden">
                <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-sm font-semibold text-text">
                    Planejamento Próximos {horizonYears} {Number(horizonYears) === 1 ? "Ano" : "Anos"}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }} className="bg-surface">
                        {["Ano","Semestre","Salário","Aporte","Gasto Máximo","Patrimônio"].map((h, i) => (
                          <th key={h} className={`px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {simRows.map((row, i) => (
                        <tr
                          key={i}
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}
                        >
                          <td className="px-5 py-3 font-medium text-text">{row.year}</td>
                          <td className="px-5 py-3 text-muted">{row.sem}º</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-muted">{fmtBRL(row.salary)}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: "#00C896" }}>{fmtBRL(row.aporte)}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs text-muted">{fmtBRL(row.gasto_maximo)}</td>
                          <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-text">{fmtBRLDec(row.patrimony)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {phases.length > 0 && simRows.length === 0 && (
              <p className="text-sm text-muted text-center py-6">Configure o patrimônio inicial e a taxa de retorno para ver a projeção.</p>
            )}
          </>
        )}

        {/* ── TAB: METAS ── */}
        {activeTab === "metas" && (
          <>
            <div className="flex justify-end">
              <Button onClick={openAddGoal}><Plus size={14} /> Nova meta</Button>
            </div>

            {goalsLoading ? (
              <div className="flex justify-center py-10"><Spinner className="h-7 w-7" /></div>
            ) : goals.length === 0 ? (
              <div className="rounded-card border border-border py-14 text-center text-sm text-muted">
                Nenhuma meta cadastrada. Crie uma para acompanhar seu progresso.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {goals.map(goal => {
                  const target  = Number(goal.target_amount);
                  const actual  = goal.actual_amount ? Number(goal.actual_amount) : null;
                  const pct     = actual !== null && target > 0 ? Math.min((actual / target) * 100, 100) : 0;
                  const done    = actual !== null && actual >= target;
                  const overdue = !done && new Date(goal.target_date) < new Date();

                  return (
                    <div
                      key={goal.id}
                      className="rounded-card border p-4"
                      style={{
                        background: "rgba(14,28,64,0.55)",
                        border: done
                          ? "1px solid rgba(0,200,150,0.25)"
                          : overdue
                            ? "1px solid rgba(255,69,101,0.20)"
                            : "1px solid rgba(255,255,255,0.09)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <Target size={16} className={done ? "text-primary" : overdue ? "text-danger" : "text-muted"} />
                          <div>
                            <p className="font-semibold text-text text-sm">{goal.description}</p>
                            <p className="text-xs text-muted mt-0.5">
                              Prazo: {new Date(goal.target_date + "T00:00:00").toLocaleDateString("pt-BR")}
                              {done && <span className="ml-2 text-primary font-medium">✓ Atingida</span>}
                              {overdue && !done && <span className="ml-2 text-danger font-medium">Vencida</span>}
                            </p>
                            {goal.note && <p className="text-xs text-muted mt-0.5">{goal.note}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openEditGoal(goal)} className="p-1.5 text-muted hover:text-text rounded transition-colors"><Pencil size={13} /></button>
                          <button onClick={() => deleteGoal(goal.id)} className="p-1.5 text-muted hover:text-danger rounded transition-colors"><Trash2 size={13} /></button>
                        </div>
                      </div>

                      {/* Values + progress */}
                      <div className="mt-3 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs text-muted mb-1.5">
                            <span>Realizado: <span className="text-text font-medium">{actual !== null ? fmtBRLDec(actual) : "—"}</span></span>
                            <span>Meta: <span className="text-text font-medium">{fmtBRLDec(target)}</span></span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                background: done
                                  ? "linear-gradient(90deg,#00C896,#00A87A)"
                                  : overdue
                                    ? "linear-gradient(90deg,#FF4565,#CC2240)"
                                    : "linear-gradient(90deg,#4A9EFF,#00C896)",
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted mt-1 text-right">{pct.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Phase modal ── */}
      <Modal
        open={showPhaseModal}
        onClose={() => setShowPhaseModal(false)}
        title={editingPhase ? "Editar Fase" : "Nova Fase Salarial"}
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Mês início</Label>
              <Select options={MONTH_OPTIONS} value={phaseForm.start_month}
                onChange={e => setPhaseForm(f => ({ ...f, start_month: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ano início</Label>
              <Select options={YEAR_OPTIONS} value={phaseForm.start_year}
                onChange={e => setPhaseForm(f => ({ ...f, start_year: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Salário líquido (R$)</Label>
            <Input type="number" min="0" step="any" placeholder="2500,00"
              value={phaseForm.salary} onChange={e => setPhaseForm(f => ({ ...f, salary: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Aporte mensal (R$)</Label>
            <Input type="number" min="0" step="any" placeholder="1000,00"
              value={phaseForm.aporte} onChange={e => setPhaseForm(f => ({ ...f, aporte: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Gasto máximo (R$)</Label>
            <Input type="number" min="0" step="any" placeholder="1500,00"
              value={phaseForm.gasto_maximo} onChange={e => setPhaseForm(f => ({ ...f, gasto_maximo: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nota (opcional)</Label>
            <Input placeholder="ex: promoção, novo emprego…"
              value={phaseForm.note} onChange={e => setPhaseForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowPhaseModal(false)}>Cancelar</Button>
            <Button onClick={savePhase} disabled={savingPhase}>
              {savingPhase ? <Spinner className="h-4 w-4" /> : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Goal modal ── */}
      <Modal
        open={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        title={editingGoal ? "Editar Meta" : "Nova Meta Financeira"}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Descrição</Label>
            <Input placeholder="ex: Reserva de emergência, Casa…"
              value={goalForm.description} onChange={e => setGoalForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Data alvo</Label>
              <Input type="date" value={goalForm.target_date}
                onChange={e => setGoalForm(f => ({ ...f, target_date: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Meta (R$)</Label>
              <Input type="number" min="0" step="any" placeholder="50000,00"
                value={goalForm.target_amount} onChange={e => setGoalForm(f => ({ ...f, target_amount: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Realizado (R$) — atualiza manualmente</Label>
            <Input type="number" min="0" step="any" placeholder="0,00"
              value={goalForm.actual_amount} onChange={e => setGoalForm(f => ({ ...f, actual_amount: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nota (opcional)</Label>
            <Input placeholder="ex: investindo R$500/mês"
              value={goalForm.note} onChange={e => setGoalForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowGoalModal(false)}>Cancelar</Button>
            <Button onClick={saveGoal} disabled={savingGoal}>
              {savingGoal ? <Spinner className="h-4 w-4" /> : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
