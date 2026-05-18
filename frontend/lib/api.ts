import { auth } from "./auth";
import type { AllocationItem, Asset, AssetPosition, AuditLog, Category, CreditCard, CreditCardPurchase, DashboardSummary, Dividend, DividendsByMonth, Invoice, MonthlyPoint, Operation, PlannedInvestment, Portfolio, PortfolioDashboard, PortfolioGoal, PortfolioPosition, Tenant, Transaction, User } from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = auth.getToken();
  const tenantId = auth.getTenantId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    auth.clear();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail ?? "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      req<{ access_token: string; refresh_token: string }>(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      ),
    me: () => req<User>("/api/v1/auth/me"),
    logout: (refreshToken: string) =>
      req("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
  },

  tenants: {
    mine: () => req<Tenant[]>("/api/v1/tenants/me"),
  },

  categories: {
    list: () => req<Category[]>("/api/v1/categories"),
    create: (data: { name: string; type: string; color?: string }) =>
      req<Category>("/api/v1/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: number, data: { name: string }) =>
      req<Category>(`/api/v1/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      req<void>(`/api/v1/categories/${id}`, { method: "DELETE" }),
  },

  transactions: {
    list: (params: {
      month?: number;
      year?: number;
      type?: string;
      category_id?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params.month) qs.set("month", String(params.month));
      if (params.year) qs.set("year", String(params.year));
      if (params.type) qs.set("type", params.type);
      if (params.category_id) qs.set("category_id", String(params.category_id));
      return req<Transaction[]>(`/api/v1/transactions?${qs}`);
    },
    create: (data: {
      category_id: number;
      type: string;
      amount: string;
      description?: string;
      date: string;
    }) =>
      req<Transaction>("/api/v1/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      req<void>(`/api/v1/transactions/${id}`, { method: "DELETE" }),
  },

  creditCards: {
    list: () => req<CreditCard[]>("/api/v1/credit-cards"),
    create: (data: { name: string; closing_day: number; due_day: number; limit?: string }) =>
      req<CreditCard>("/api/v1/credit-cards", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: number) => req<void>(`/api/v1/credit-cards/${id}`, { method: "DELETE" }),
    purchases: (cardId: number) =>
      req<CreditCardPurchase[]>(`/api/v1/credit-cards/${cardId}/purchases`),
    addPurchase: (
      cardId: number,
      data: { description: string; total_amount: string; installments: number; purchase_date: string }
    ) =>
      req<CreditCardPurchase>(`/api/v1/credit-cards/${cardId}/purchases`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    removePurchase: (cardId: number, purchaseId: number) =>
      req<void>(`/api/v1/credit-cards/${cardId}/purchases/${purchaseId}`, { method: "DELETE" }),
    invoice: (cardId: number, month: number, year: number) =>
      req<Invoice>(`/api/v1/credit-cards/${cardId}/invoice?month=${month}&year=${year}`),
  },

  plannedInvestments: {
    list: (params: { month?: number; year?: number }) => {
      const qs = new URLSearchParams();
      if (params.month) qs.set("month", String(params.month));
      if (params.year) qs.set("year", String(params.year));
      return req<PlannedInvestment[]>(`/api/v1/planned-investments?${qs}`);
    },
    create: (data: {
      month: number;
      year: number;
      asset_label: string;
      amount_planned: string;
      note?: string;
    }) =>
      req<PlannedInvestment>("/api/v1/planned-investments", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    remove: (id: number) => req<void>(`/api/v1/planned-investments/${id}`, { method: "DELETE" }),
  },

  reports: {
    download: async (format: "pdf" | "xlsx", year: number, month?: number): Promise<Blob> => {
      const token = auth.getToken();
      const tenantId = auth.getTenantId();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
      const qs = new URLSearchParams({ format, year: String(year) });
      if (month) qs.set("month", String(month));
      const res = await fetch(`${BASE}/api/v1/reports/transactions?${qs}`, { headers });
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    },
  },

  dashboard: {
    summary: (month: number, year: number) =>
      req<DashboardSummary>(`/api/v1/dashboard/summary?month=${month}&year=${year}`),
    yearly: (year: number) =>
      req<MonthlyPoint[]>(`/api/v1/dashboard/yearly?year=${year}`),
  },

  portfolios: {
    list: () => req<Portfolio[]>("/api/v1/portfolios"),
    create: (data: { name: string; description?: string }) =>
      req<Portfolio>("/api/v1/portfolios", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { name?: string; description?: string }) =>
      req<Portfolio>(`/api/v1/portfolios/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) => req<void>(`/api/v1/portfolios/${id}`, { method: "DELETE" }),
    position: (id: number) => req<PortfolioPosition>(`/api/v1/portfolios/${id}/position`),

    assets: (portfolioId: number) => req<Asset[]>(`/api/v1/portfolios/${portfolioId}/assets`),
    addAsset: (portfolioId: number, data: { ticker: string; name?: string; asset_class?: string }) =>
      req<Asset>(`/api/v1/portfolios/${portfolioId}/assets`, { method: "POST", body: JSON.stringify(data) }),
    removeAsset: (portfolioId: number, assetId: number) =>
      req<void>(`/api/v1/portfolios/${portfolioId}/assets/${assetId}`, { method: "DELETE" }),

    operations: (portfolioId: number, assetId: number) =>
      req<Operation[]>(`/api/v1/portfolios/${portfolioId}/assets/${assetId}/operations`),
    addOperation: (portfolioId: number, assetId: number, data: {
      type: string; quantity: string; unit_price: string; date: string; broker?: string; note?: string;
    }) =>
      req<Operation>(`/api/v1/portfolios/${portfolioId}/assets/${assetId}/operations`, {
        method: "POST", body: JSON.stringify(data),
      }),
    removeOperation: (portfolioId: number, assetId: number, opId: number) =>
      req<void>(`/api/v1/portfolios/${portfolioId}/assets/${assetId}/operations/${opId}`, { method: "DELETE" }),

    dividends: (portfolioId: number) => req<Dividend[]>(`/api/v1/portfolios/${portfolioId}/dividends`),
    addDividend: (portfolioId: number, assetId: number, data: { amount: string; date: string; note?: string }) =>
      req<Dividend>(`/api/v1/portfolios/${portfolioId}/assets/${assetId}/dividends`, {
        method: "POST", body: JSON.stringify(data),
      }),
    removeDividend: (portfolioId: number, divId: number) =>
      req<void>(`/api/v1/portfolios/${portfolioId}/dividends/${divId}`, { method: "DELETE" }),

    dashboard: (portfolioId: number) =>
      req<PortfolioDashboard>(`/api/v1/portfolios/${portfolioId}/dashboard`),

    goals: (portfolioId: number) => req<PortfolioGoal[]>(`/api/v1/portfolios/${portfolioId}/goals`),
    createGoal: (portfolioId: number, data: { name: string; patrimony_target?: string; dividends_target?: string }) =>
      req<PortfolioGoal>(`/api/v1/portfolios/${portfolioId}/goals`, { method: "POST", body: JSON.stringify(data) }),
    updateGoal: (portfolioId: number, goalId: number, data: { name?: string; patrimony_target?: string; dividends_target?: string }) =>
      req<PortfolioGoal>(`/api/v1/portfolios/${portfolioId}/goals/${goalId}`, { method: "PUT", body: JSON.stringify(data) }),
    removeGoal: (portfolioId: number, goalId: number) =>
      req<void>(`/api/v1/portfolios/${portfolioId}/goals/${goalId}`, { method: "DELETE" }),

    exportReport: async (portfolioId: number, format: "pdf" | "xlsx"): Promise<Blob> => {
      const token = auth.getToken();
      const tenantId = auth.getTenantId();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
      const res = await fetch(`${BASE}/api/v1/reports/portfolio?portfolio_id=${portfolioId}&format=${format}`, { headers });
      if (!res.ok) throw new Error("Export failed");
      return res.blob();
    },
  },

  admin: {
    auditLog: (params: { page?: number; action?: string; user_id?: number; tenant_id?: number }) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", String(params.page));
      if (params.action) qs.set("action", params.action);
      if (params.user_id) qs.set("user_id", String(params.user_id));
      if (params.tenant_id) qs.set("tenant_id", String(params.tenant_id));
      return req<AuditLog[]>(`/api/v1/admin/audit-log?${qs}`);
    },
  },
};
