"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Select } from "@/components/ui/select";

interface HeaderProps {
  title: string;
  action?: ReactNode;
}

export function Header({ title, action }: HeaderProps) {
  const { tenants, currentTenantId, setCurrentTenantId } = useAuth();

  const options = tenants.map((t) => ({ value: t.id, label: t.name }));

  return (
    <header className="flex h-12 items-center justify-between border-b border-border pb-4 mb-2">
      <h1 className="text-lg font-semibold text-text">{title}</h1>

      <div className="flex items-center gap-3">
        {action}
        {tenants.length > 1 && (
          <div className="w-48">
            <Select
              options={options}
              value={currentTenantId ?? ""}
              onChange={(e) => setCurrentTenantId(Number(e.target.value))}
            />
          </div>
        )}
      </div>
    </header>
  );
}
