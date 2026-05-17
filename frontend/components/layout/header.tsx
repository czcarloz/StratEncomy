"use client";

import { useAuth } from "@/contexts/auth-context";
import { Select } from "@/components/ui/select";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { tenants, currentTenantId, setCurrentTenantId } = useAuth();

  const options = tenants.map((t) => ({ value: t.id, label: t.name }));

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-6">
      <h1 className="text-base font-semibold text-zinc-100">{title}</h1>

      {tenants.length > 1 && (
        <div className="w-48">
          <Select
            options={options}
            value={currentTenantId ?? ""}
            onChange={(e) => setCurrentTenantId(Number(e.target.value))}
          />
        </div>
      )}
    </header>
  );
}
