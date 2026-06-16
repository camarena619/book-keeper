"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/payroll", label: "Pay Runs" },
  { href: "/dashboard/payroll/employees", label: "Employees" },
];

export function PayrollTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium",
              active
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
