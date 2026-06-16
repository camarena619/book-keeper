"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

const PayStubDownloadButton = dynamic(() => import("./PayStubDownloadButton"), {
  ssr: false,
  loading: () => <span className="btn-secondary opacity-60">…</span>,
});

export interface PayStubAmounts {
  gross_cents: number;
  federal_tax_cents: number;
  state_tax_cents: number;
  social_security_cents: number;
  medicare_cents: number;
  other_deductions_cents: number;
  net_cents: number;
}
export interface PayRunItemRow {
  employee_id: string;
  employee_name: string;
  employee_address: string | null;
  hours: number | null;
  current: PayStubAmounts;
  ytd: PayStubAmounts;
}

export function PayRunDetailView({
  run,
  rows,
  employer,
}: {
  run: { period_start: string; period_end: string; pay_date: string; status: string };
  rows: PayRunItemRow[];
  employer: { name: string; address: string | null };
}) {
  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += r.current.gross_cents;
      acc.net += r.current.net_cents;
      acc.taxes +=
        r.current.federal_tax_cents +
        r.current.state_tax_cents +
        r.current.social_security_cents +
        r.current.medicare_cents +
        r.current.other_deductions_cents;
      return acc;
    },
    { gross: 0, taxes: 0, net: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/dashboard/payroll"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to pay runs
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Pay run — {formatDate(run.pay_date)}
          </h1>
          <p className="text-sm text-slate-500">
            Period {formatDate(run.period_start)} – {formatDate(run.period_end)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            run.status === "posted"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700",
          )}
        >
          {run.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Total gross" value={totals.gross} />
        <Stat label="Total taxes withheld" value={totals.taxes} />
        <Stat label="Total net pay" value={totals.net} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="py-2">Employee</th>
              <th className="text-right">Gross</th>
              <th className="text-right">Fed</th>
              <th className="text-right">State</th>
              <th className="text-right">SS</th>
              <th className="text-right">Medicare</th>
              <th className="text-right">Net</th>
              <th className="text-right">Stub</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{r.employee_name}</td>
                <td className="text-right font-mono">{formatCurrency(r.current.gross_cents)}</td>
                <td className="text-right font-mono text-slate-500">{formatCurrency(r.current.federal_tax_cents)}</td>
                <td className="text-right font-mono text-slate-500">{formatCurrency(r.current.state_tax_cents)}</td>
                <td className="text-right font-mono text-slate-500">{formatCurrency(r.current.social_security_cents)}</td>
                <td className="text-right font-mono text-slate-500">{formatCurrency(r.current.medicare_cents)}</td>
                <td className="text-right font-mono font-semibold">{formatCurrency(r.current.net_cents)}</td>
                <td className="py-2">
                  <div className="flex justify-end">
                    <PayStubDownloadButton
                      data={{
                        employer,
                        employee: { name: r.employee_name, address: r.employee_address },
                        period: {
                          start: run.period_start,
                          end: run.period_end,
                          pay_date: run.pay_date,
                        },
                        current: r.current,
                        ytd: r.ytd,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold">{formatCurrency(value)}</div>
    </div>
  );
}
