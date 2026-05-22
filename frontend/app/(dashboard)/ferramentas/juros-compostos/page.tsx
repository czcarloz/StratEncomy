"use client";

import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Header } from "@/components/layout/header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary: "#059669", info: "#3B82F6",
  muted: "#94A3B8", border: "#334155", surface: "#1E293B",
};

// ── Compound interest engine ──────────────────────────────────────────────────
interface MonthPoint {
  month: number;
  invested: number;
  balance: number;
  interest: number;
}

function calcMonthly(
  initial: number,
  monthly: number,
  monthlyRate: number,
  months: number,
): MonthPoint[] {
  const points: MonthPoint[] = [];
  let balance = initial;
  let totalInvested = initial;

  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + monthlyRate) + monthly;
    totalInvested += monthly;
    points.push({
      month: m,
      invested: totalInvested,
      balance: parseFloat(balance.toFixed(2)),
      interest: parseFloat((balance - totalInvested).toFixed(2)),
    });
  }
  return points;
}

function toMonthlyRate(rate: number, type: "month" | "year"): number {
  if (type === "month") return rate / 100;
  return Math.pow(1 + rate / 100, 1 / 12) - 1;
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2 text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-medium" style={{ color: i === 0 ? C.info : C.primary }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function JurosCompostosPage() {
  const [initial, setInitial]   = useState("10000");
  const [monthly, setMonthly]   = useState("500");
  const [rate, setRate]         = useState("1");
  const [rateType, setRateType] = useState<"month" | "year">("month");
  const [period, setPeriod]     = useState("120");
  const [periodType, setPeriodType] = useState<"month" | "year">("month");

  const result = useMemo(() => {
    const pv  = parseFloat(initial)  || 0;
    const pmt = parseFloat(monthly)  || 0;
    const r   = parseFloat(rate)     || 0;
    const n   = parseInt(period)     || 0;

    const months = periodType === "year" ? n * 12 : n;
    if (months <= 0 || r <= 0) return null;

    const monthlyRate = toMonthlyRate(r, rateType);
    const points = calcMonthly(pv, pmt, monthlyRate, months);
    const last = points[points.length - 1];

    // chart data: monthly if ≤ 24 months, yearly otherwise
    let chartData;
    if (months <= 24) {
      chartData = points.map((p) => ({
        label: `Mês ${p.month}`,
        invested: p.invested,
        balance: p.balance,
      }));
    } else {
      chartData = points
        .filter((p) => p.month % 12 === 0)
        .map((p) => ({
          label: `Ano ${p.month / 12}`,
          invested: p.invested,
          balance: p.balance,
        }));
    }

    // yearly table
    const yearlyTable = points
      .filter((p) => p.month % 12 === 0 || p.month === months)
      .reduce<{ year: number; invested: number; balance: number; interest: number }[]>((acc, p) => {
        const year = Math.ceil(p.month / 12);
        const last = acc[acc.length - 1];
        if (!last || last.year !== year) {
          acc.push({ year, invested: p.invested, balance: p.balance, interest: p.interest });
        } else {
          last.invested = p.invested;
          last.balance = p.balance;
          last.interest = p.interest;
        }
        return acc;
      }, []);

    const totalInvested = pv + pmt * months;
    const interestPct = last.balance > 0 ? (last.interest / last.balance) * 100 : 0;

    return {
      finalAmount: last.balance,
      totalInvested,
      totalInterest: last.interest,
      interestPct,
      chartData,
      yearlyTable,
      monthlyRate,
    };
  }, [initial, monthly, rate, rateType, period, periodType]);

  const periodLabel = periodType === "year"
    ? `${period} ano${parseInt(period) !== 1 ? "s" : ""}`
    : `${period} ${parseInt(period) !== 1 ? "meses" : "mês"}`;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header title="Juros Compostos" />

      <div className="flex flex-col flex-1 overflow-auto px-6 py-5 gap-6">
        {/* Form */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label>Aporte inicial (R$)</Label>
            <Input
              type="number" min="0" step="any" placeholder="10000"
              value={initial} onChange={(e) => setInitial(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Aporte mensal (R$)</Label>
            <Input
              type="number" min="0" step="any" placeholder="500"
              value={monthly} onChange={(e) => setMonthly(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Taxa de rentabilidade (%)</Label>
            <div className="flex gap-2">
              <Input
                type="number" min="0" step="any" placeholder="1"
                value={rate} onChange={(e) => setRate(e.target.value)}
                className="flex-1"
              />
              <Select
                value={rateType}
                onChange={(e) => setRateType(e.target.value as "month" | "year")}
                className="w-28"
                options={[
                  { value: "month", label: "ao mês" },
                  { value: "year",  label: "ao ano"  },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Período</Label>
            <div className="flex gap-2">
              <Input
                type="number" min="1" step="1" placeholder="120"
                value={period} onChange={(e) => setPeriod(e.target.value)}
                className="flex-1"
              />
              <Select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as "month" | "year")}
                className="w-28"
                options={[
                  { value: "month", label: "meses" },
                  { value: "year",  label: "anos"  },
                ]}
              />
            </div>
          </div>
        </div>

        {!result ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Preencha os campos acima para ver a projeção.
          </div>
        ) : (
          <>
            {/* Result cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <ResultCard
                label="Montante final"
                value={formatCurrency(result.finalAmount)}
                sub={`em ${periodLabel}`}
                highlight
              />
              <ResultCard
                label="Total investido"
                value={formatCurrency(result.totalInvested)}
                sub={`${(100 - result.interestPct).toFixed(1)}% do montante`}
                color="text-info"
              />
              <ResultCard
                label="Juros totais"
                value={formatCurrency(result.totalInterest)}
                sub={`${result.interestPct.toFixed(1)}% do montante`}
                color="text-success"
              />
            </div>

            {/* Rate info */}
            <p className="text-xs text-muted -mt-2">
              Taxa mensal efetiva:{" "}
              <span className="font-medium text-text">
                {(result.monthlyRate * 100).toFixed(4)}% a.m.
              </span>
              {rateType === "year" && (
                <span className="ml-2">
                  · Taxa anual:{" "}
                  <span className="font-medium text-text">{rate}% a.a.</span>
                </span>
              )}
            </p>

            {/* Chart */}
            <div className="rounded-card border border-border bg-surface p-5">
              <p className="text-sm font-medium text-text mb-4">Evolução do patrimônio</p>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={result.chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.primary} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={C.primary} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradInvested" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.info} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.info} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `R$${v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                  <Area type="monotone" dataKey="invested" name="Total investido" stroke={C.info} fill="url(#gradInvested)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="balance" name="Montante" stroke={C.primary} fill="url(#gradBalance)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Yearly breakdown table */}
            <div className="rounded-card border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Ano</th>
                    <th className="px-4 py-2.5 font-medium text-right">Total investido</th>
                    <th className="px-4 py-2.5 font-medium text-right">Juros acumulados</th>
                    <th className="px-4 py-2.5 font-medium text-right">Montante</th>
                    <th className="px-4 py-2.5 font-medium text-right">% juros</th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearlyTable.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-surface/60 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-text">{row.year}º ano</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-info">{formatCurrency(row.invested)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-success">{formatCurrency(row.interest)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-text">{formatCurrency(row.balance)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted">
                        {row.balance > 0 ? ((row.interest / row.balance) * 100).toFixed(1) : "0.0"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResultCard({ label, value, sub, highlight, color }: {
  label: string; value: string; sub?: string; highlight?: boolean; color?: string;
}) {
  return (
    <div className={`rounded-card border p-4 ${highlight ? "border-primary/40 bg-primary-bg/20" : "border-border bg-surface"}`}>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? (highlight ? "text-primary" : "text-text")}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
