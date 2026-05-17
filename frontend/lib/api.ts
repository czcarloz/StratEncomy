import { auth } from "./auth";
import type { Category, Tenant, Transaction, User } from "@/types";

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
};
