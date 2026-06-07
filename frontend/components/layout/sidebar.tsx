"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ArrowLeftRight, CreditCard, TrendingUp, LogOut, Tag, ScrollText, Briefcase, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const NAV_ALL = [
  { href: "/dashboard",                    label: "Dashboard",           icon: LayoutDashboard, adminOnly: false },
  { href: "/transactions",                 label: "Transactions",        icon: ArrowLeftRight,  adminOnly: false },
  { href: "/credit-cards",                 label: "Credit Cards",        icon: CreditCard,      adminOnly: false },
  { href: "/planned-investments",          label: "Planned Investments", icon: TrendingUp,      adminOnly: true  },
  { href: "/portfolios",                   label: "Portfolios",          icon: Briefcase,       adminOnly: false },
  { href: "/ferramentas/juros-compostos",  label: "Juros Compostos",     icon: Wrench,          adminOnly: false },
  { href: "/ferramentas/simulador-aportes",label: "Simulador Aportes",   icon: TrendingUp,      adminOnly: false },
  { href: "/categories",                   label: "Categories",          icon: Tag,             adminOnly: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

  const navItems = [
    ...NAV_ALL.filter(item => !item.adminOnly || isAdmin),
    ...(isAdmin ? [{ href: "/audit", label: "Audit Log", icon: ScrollText, adminOnly: true }] : []),
  ];

  return (
    <aside
      className="flex h-screen w-56 flex-col px-3 py-5 shrink-0"
      style={{
        background: "rgba(8,18,46,0.72)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Logo */}
      <div className="mb-7 px-2">
        <span
          className="text-base font-bold tracking-tight"
          style={{
            background: "linear-gradient(135deg, #00C896 0%, #4A9EFF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          StratEncomy
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard"
            ? pathname === href
            : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "text-primary"
                  : "text-muted hover:text-text"
              )}
              style={active ? {
                background: "rgba(0,200,150,0.10)",
                boxShadow: "inset 0 0 0 1px rgba(0,200,150,0.18)",
              } : undefined}
            >
              <Icon size={15} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} className="pt-4">
        <p className="mb-2 truncate px-2 text-xs text-muted">{user?.email}</p>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-card px-3 py-2 text-sm text-muted transition-all duration-150 hover:text-text"
          style={{ }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
          onMouseLeave={e => (e.currentTarget.style.background = "")}
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
