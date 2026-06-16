"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  FileSpreadsheet,
  Receipt,
  Repeat,
  Wallet,
  BookOpen,
  BarChart3,
  BadgeDollarSign,
  Landmark,
  Settings,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/estimates", label: "Estimates", icon: FileSpreadsheet },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/recurring", label: "Recurring", icon: Repeat },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { href: "/dashboard/banking", label: "Banking", icon: Wallet },
  { href: "/dashboard/ledger", label: "General Ledger", icon: BookOpen },
  { href: "/dashboard/payroll", label: "Payroll", icon: BadgeDollarSign },
  { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/tax", label: "1099-NEC", icon: Landmark },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// Renders the link contents; shows a spinner while this link's navigation is
// pending (useLinkStatus reads the status of the enclosing <Link>).
function NavItemContent({ Icon, label }: { Icon: LucideIcon; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
    </>
  );
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/dashboard"
            ? pathname === href
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
              active
                ? "bg-brand-soft font-semibold text-brand shadow-xs"
                : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" />
            )}
            <NavItemContent Icon={Icon} label={label} />
          </Link>
        );
      })}
    </nav>
  );
}
