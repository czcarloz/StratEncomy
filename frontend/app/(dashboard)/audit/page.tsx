"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import type { AuditLog } from "@/types";
import { Header } from "@/components/layout/header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE = 50;

export default function AuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [draftAction, setDraftAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.admin.auditLog({
        page,
        action: actionFilter || undefined,
      });
      setLogs(data);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setActionFilter(draftAction);
  }

  function formatTs(ts: string) {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  const ACTION_COLOR: Record<string, string> = {
    "auth.login":       "bg-primary-bg text-primary",
    "auth.login_fail":  "bg-danger-bg text-danger",
    "auth.logout":      "bg-surface text-muted",
    "auth.refresh":     "bg-surface text-muted",
  };

  function actionBadgeClass(action: string) {
    if (ACTION_COLOR[action]) return ACTION_COLOR[action];
    if (action.endsWith(".create")) return "bg-primary-bg text-success";
    if (action.endsWith(".update")) return "bg-info-bg text-info";
    if (action.endsWith(".delete")) return "bg-danger-bg text-danger";
    return "bg-surface text-muted";
  }

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title="Audit Log" />
        <div className="flex flex-1 items-center justify-center text-muted text-sm">
          Access restricted to administrators.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <Header title="Audit Log" />

      <div className="flex flex-col flex-1 overflow-hidden px-6 py-5 gap-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2 max-w-sm">
          <Input
            placeholder="Filter by action…"
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary">
            <Search size={14} />
          </Button>
        </form>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="overflow-auto rounded-card border border-border flex-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Timestamp</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-4 py-2.5 font-medium">Entity</th>
                    <th className="px-4 py-2.5 font-medium">User ID</th>
                    <th className="px-4 py-2.5 font-medium">Tenant ID</th>
                    <th className="px-4 py-2.5 font-medium">IP</th>
                    <th className="px-4 py-2.5 font-medium">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        No audit entries found.
                      </td>
                    </tr>
                  )}
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-surface/60 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap font-mono text-xs text-muted">
                        {formatTs(log.ts)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">
                        {log.entity ? (
                          <span>
                            {log.entity}
                            {log.entity_id != null && <span className="ml-1 opacity-60">#{log.entity_id}</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">{log.user_id ?? "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{log.tenant_id ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">{log.ip ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted max-w-xs truncate">
                        {log.payload_json ? JSON.stringify(log.payload_json) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">
                Page {page} — {logs.length} entries
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft size={14} />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={logs.length < PAGE_SIZE}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
