"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Download } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatCurrency, MONTHS } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import type { DashboardSummary, MonthlyPoint } from "@/types";
import { Header } from "@/components/layout/header";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

// ── Design tokens (match tailwind config) ──────────────────────────────────
const C = {
  primary:    "#059669",
  success:    "#10B981",
  danger:     "#DC2626",
  info:       "#3B82F6",
  warning:    "#F59E0B",
  muted:      "#94A3B8",
  border:     "#334155",
  surface2:   "#334155",
  bg:         "#0F172A",
  surface:    "#1E293B",
};

const PIE_COLORS = ["#059669", "#10B981", "#3B82F6", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS  = Array.from({ length: 5 }, (_, i) => ({ value: CURRENT_YEAR - i, label: String(CURRENT_YEAR - i) }));
const MONTH_OPTIONS = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

// ── Helpers ────────────────────────────────────────────────────────────────

function delta(current: string, prev: string): number {
  const c = Number(current), p = Number(prev);
  if (p === 0) return 0;
  return Math.round(((c - p) / p) * 100);
}

function DeltaBadge({ pct, inverse = false }: { pct: number; inverse?: boolean }) {
  if (pct === 0) return <span className="flex items-center gap-1 text-xs text-muted"><Minus size={11} /> 0%</span>;
  const positive = inverse ? pct < 0 : pct > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${positive ? "text-success" : "text-danger"}`}>
      {pct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pct > 0 ? "+" : ""}{pct}% vs prev month
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  label, value, delta: d, inverse = false, accent,
}: {
  label: string; value: string; delta: number; inverse?: boolean; accent: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-5 flex flex-col gap-3">
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold tabular`} style={{ color: accent }}>
        {formatCurrency(value)}
      </p>
      <DeltaBadge pct={d} inverse={inverse} />
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-xl text-xs">
      {label && <p className="text-muted mb-2 font-medium">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="tabular font-medium">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { currentTenantId } = useAuth();

  const [month, setMonth]         = useState(new Date().getMonth() + 1);
  const [year, setYear]           = useState(CURRENT_YEAR);
  const [summary, setSummary]     = useState<DashboardSummary | null>(null);
  const [yearly, setYearly]       = useState<MonthlyPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [s, y] = await Promise.all([
        api.dashboard.summary(month, year),
        api.dashboard.yearly(year),
      ]);
      setSummary(s);
      setYearly(y);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, month, year]);

  useEffect(() => { load(); }, [load]);

  async function handleExport(format: "pdf" | "xlsx") {
    setExporting(format);
    try {
      const blob = await api.reports.download(format, month, year);
      const ext = format === "pdf" ? "pdf" : "xlsx";
      downloadBlob(blob, `transactions_${year}_${String(month).padStart(2, "0")}.${ext}`);
    } finally {
      setExporting(null);
    }
  }

  // Yearly chart data
  const yearlyData = yearly.map((p) => ({
    name: MONTHS[p.month - 1].slice(0, 3),
    Income:     Number(p.total_income),
    Expense:    Number(p.total_expense),
    Investment: Number(p.total_investment),
    Balance:    Number(p.balance),
  }));

  // Pie data
  const pieData = summary?.expense_by_category.map((c) => ({
    name: c.name,
    value: Number(c.amount),
  })) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Header title="Dashboard" />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select options={MONTH_OPTIONS} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-36" />
        <Select options={YEAR_OPTIONS}  value={year}  onChange={(e) => setYear(Number(e.target.value))}  className="w-28" />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => handleExport("xlsx")} disabled={exporting !== null}>
            {exporting === "xlsx" ? <Spinner className="h-3.5 w-3.5" /> : <Download size={14} />}
            XLSX
          </Button>
          <Button variant="secondary" onClick={() => handleExport("pdf")} disabled={exporting !== null}>
            {exporting === "pdf" ? <Spinner className="h-3.5 w-3.5" /> : <Download size={14} />}
            PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : !summary ? null : (
        <>
          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Income"
              value={summary.total_income}
              delta={delta(summary.total_income, summary.prev_month.total_income)}
              accent={C.success}
            />
            <KpiCard
              label="Expenses"
              value={summary.total_expense}
              delta={delta(summary.total_expense, summary.prev_month.total_expense)}
              inverse
              accent={C.danger}
            />
            <KpiCard
              label="Invested"
              value={summary.total_investment}
              delta={delta(summary.total_investment, summary.prev_month.total_investment)}
              accent={C.info}
            />
            <KpiCard
              label="Balance"
              value={summary.balance}
              delta={delta(summary.balance, summary.prev_month.balance)}
              accent={Number(summary.balance) >= 0 ? C.success : C.danger}
            />
          </div>

          {/* ── Middle row: Pie + Bar ── */}
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Expense breakdown pie */}
            <div className="rounded-card border border-border bg-surface p-5">
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-4">Expenses by category</p>
              {pieData.length === 0 ? (
                <p className="text-center text-sm text-muted py-10">No expenses this month.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5">
                    {summary.expense_by_category.map((c, i) => (
                      <div key={c.category_id} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-muted">{c.name}</span>
                        </span>
                        <span className="tabular font-medium text-text">{c.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Monthly bar chart */}
            <div className="rounded-card border border-border bg-surface p-5">
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-4">Monthly overview — {year}</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={yearlyData} barCategoryGap="30%" barGap={2}>
                  <CartesianGrid vertical={false} stroke={C.border} strokeOpacity={0.4} />
                  <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: C.surface2, opacity: 0.3 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
                  <Bar dataKey="Income"     fill={C.success} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Expense"    fill={C.danger}  radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Investment" fill={C.info}    radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Balance line chart ── */}
          <div className="rounded-card border border-border bg-surface p-5">
            <p className="text-xs font-medium text-muted uppercase tracking-wide mb-4">Balance evolution — {year}</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={yearlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="Balance"
                  stroke={C.primary}
                  strokeWidth={2}
                  dot={{ fill: C.primary, r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
