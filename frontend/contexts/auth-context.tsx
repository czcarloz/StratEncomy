"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import type { Tenant, User } from "@/types";

interface AuthContextValue {
  user: User | null;
  tenants: Tenant[];
  currentTenantId: number | null;
  isLoading: boolean;
  isAdmin: boolean;
  setCurrentTenantId: (id: number) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, setCurrentTenantIdState] = useState<number | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = auth.getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    Promise.all([api.auth.me(), api.tenants.mine()])
      .then(([me, myTenants]) => {
        setUser(me);
        setTenants(myTenants);
        const stored = auth.getTenantId();
        const valid =
          stored && myTenants.some((t) => t.id === stored)
            ? stored
            : myTenants[0]?.id ?? null;
        if (valid) auth.setTenantId(valid);
        setCurrentTenantIdState(valid);
      })
      .catch(() => {
        auth.clear();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setCurrentTenantId = useCallback((id: number) => {
    auth.setTenantId(id);
    setCurrentTenantIdState(id);
  }, []);

  const logout = useCallback(async () => {
    const refresh = auth.getRefreshToken();
    if (refresh) {
      await api.auth.logout(refresh).catch(() => {});
    }
    auth.clear();
    setUser(null);
    setTenants([]);
    setCurrentTenantIdState(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, tenants, currentTenantId, isLoading, isAdmin: user?.role === "admin", setCurrentTenantId, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
