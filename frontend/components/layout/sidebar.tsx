"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowLeftRight, CreditCard, TrendingUp, LogOut, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const NAV = [
  { href: "/transactions",        label: "Transactions",        icon: ArrowLeftRight },
  { href: "/credit-cards",        label: "Credit Cards",        icon: CreditCard },
  { href: "/planned-investments", label: "Planned Investments", icon: TrendingUp },
  { href: "/categories",          label: "Categories",          icon: Tag },
  { href: "/dashboard",           label: "Dashboard",           icon: LayoutDashboard },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-bg px-3 py-5">
      <div className="mb-6 px-2">
        <span className="text-base font-semibold text-primary tracking-tight">StratEncomy</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium transition-colors duration-150",
              pathname === href
                ? "bg-primary-bg text-primary"
                : "text-muted hover:bg-surface hover:text-text"
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border pt-4">
        <p className="mb-2 truncate px-2 text-xs text-muted">{user?.email}</p>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
