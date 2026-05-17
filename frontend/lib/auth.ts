const KEYS = {
  token: "se_access_token",
  refresh: "se_refresh_token",
  tenant: "se_tenant_id",
};

function get(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

export const auth = {
  getToken: () => get(KEYS.token),
  getRefreshToken: () => get(KEYS.refresh),
  getTenantId: (): number | null => {
    const v = get(KEYS.tenant);
    return v ? parseInt(v, 10) : null;
  },
  setTokens: (access: string, refresh: string) => {
    localStorage.setItem(KEYS.token, access);
    localStorage.setItem(KEYS.refresh, refresh);
  },
  setTenantId: (id: number) => {
    localStorage.setItem(KEYS.tenant, String(id));
  },
  clear: () => Object.values(KEYS).forEach((k) => localStorage.removeItem(k)),
};
