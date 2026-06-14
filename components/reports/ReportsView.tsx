"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export interface ReportInvoice {
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  status: string;
  due_date: string;
  created_at: string;
  grand_total_cents: number;
}
export interface ReportExpense {
  id: string;
  title: string;
  category: string;
  amount_cents: number;
  expense_date: string;
}

const TABS = [
  { id: "aging", label: "A/R Aging" },
  { id: "sales", label: "Sales by Customer" },
  { id: "expense", label: "Expense by Category" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DAY = 86_400_000;
const AGING_BUCKETS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;

function bucketFor(dueDate: string): (typeof AGING_BUCKETS)[number] {
  const overdue = Math.floor((Date.now() - new Date(dueDate).getTime()) / DAY);
  if (overdue <= 0) return "Current";
  if (overdue <= 30) return "1–30";
  if (overdue <= 60) return "31–60";
  if (overdue <= 90) return "61–90";
  return "90+";
}

export function ReportsView({
  invoices,
  expenses,
}: {
  invoices: ReportInvoice[];
  expenses: ReportExpense[];
}) {
  const [tab, setTab] = useState<TabId>("aging");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime() + DAY) return false;
    return true;
  };

  // ---- A/R Aging (point-in-time: all unpaid invoices) ----
  const aging = useMemo(() => {
    const open = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
    const totals: Record<string, number> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));
    const rows = open.map((i) => {
      const b = bucketFor(i.due_date);
      totals[b] += i.grand_total_cents;
      return { ...i, bucket: b };
    });
    const grand = open.reduce((s, i) => s + i.grand_total_cents, 0);
    return { totals, rows, grand };
  }, [invoices]);

  // ---- Sales by Customer (paid invoices, date-filtered) ----
  const sales = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid" && inRange(i.created_at));
    const map = new Map<string, { total: number; count: number }>();
    for (const i of paid) {
      const key = i.client_name ?? "—";
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += i.grand_total_cents;
      cur.count += 1;
      map.set(key, cur);
    }
    const rows = [...map.entries()]
      .map(([client, v]) => ({ client, ...v }))
      .sort((a, b) => b.total - a.total);
    return { rows, grand: rows.reduce((s, r) => s + r.total, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, from, to]);

  // ---- Expense by Category (date-filtered) ----
  const expenseByCat = useMemo(() => {
    const filtered = expenses.filter((e) => inRange(e.expense_date));
    const map = new Map<string, { total: number; count: number }>();
    for (const e of filtered) {
      const cur = map.get(e.category) ?? { total: 0, count: 0 };
      cur.total += e.amount_cents;
      cur.count += 1;
      map.set(e.category, cur);
    }
    const rows = [...map.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total);
    return { rows, grand: rows.reduce((s, r) => s + r.total, 0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, from, to]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">Financial summaries from your data</p>
        </div>
        {tab !== "aging" && (
          <div className="flex items-end gap-2">
            <div>
              <label className="label text-xs">From</label>
              <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">To</label>
              <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* A/R AGING */}
      {tab === "aging" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {AGING_BUCKETS.map((b) => (
              <div key={b} className="card">
                <div className="text-xs text-slate-500">{b}{b !== "Current" ? " days" : ""}</div>
                <div className="mt-1 font-mono font-semibold">{formatCurrency(aging.totals[b])}</div>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">
                Outstanding receivables · {formatCurrency(aging.grand)}
              </h2>
              <button
                className="btn-secondary text-xs"
                disabled={aging.rows.length === 0}
                onClick={() =>
                  downloadCsv(
                    "ar-aging.csv",
                    ["Invoice", "Client", "Due", "Bucket", "Amount"],
                    aging.rows.map((r) => [
                      r.invoice_number,
                      r.client_name ?? "",
                      formatDate(r.due_date),
                      r.bucket,
                      (r.grand_total_cents / 100).toFixed(2),
                    ]),
                  )
                }
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
            <ReportTable
              head={["Invoice", "Client", "Due", "Bucket", "Amount"]}
              rows={aging.rows.map((r) => [
                r.invoice_number,
                r.client_name ?? "",
                formatDate(r.due_date),
                r.bucket,
                formatCurrency(r.grand_total_cents),
              ])}
              empty="No outstanding invoices. 🎉"
              numericLast
            />
          </div>
        </div>
      )}

      {/* SALES BY CUSTOMER */}
      {tab === "sales" && (
        <div className="card overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Sales by customer · {formatCurrency(sales.grand)} (paid)</h2>
            <button
              className="btn-secondary text-xs"
              disabled={sales.rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "sales-by-customer.csv",
                  ["Customer", "Invoices", "Total"],
                  sales.rows.map((r) => [r.client, r.count, (r.total / 100).toFixed(2)]),
                )
              }
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <ReportTable
            head={["Customer", "Invoices", "Total"]}
            rows={sales.rows.map((r) => [r.client, String(r.count), formatCurrency(r.total)])}
            empty="No paid invoices in this range."
            numericLast
          />
        </div>
      )}

      {/* EXPENSE BY CATEGORY */}
      {tab === "expense" && (
        <div className="card overflow-x-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Expense by category · {formatCurrency(expenseByCat.grand)}</h2>
            <button
              className="btn-secondary text-xs"
              disabled={expenseByCat.rows.length === 0}
              onClick={() =>
                downloadCsv(
                  "expense-by-category.csv",
                  ["Category", "Count", "Total", "% of total"],
                  expenseByCat.rows.map((r) => [
                    r.category,
                    r.count,
                    (r.total / 100).toFixed(2),
                    expenseByCat.grand ? ((r.total / expenseByCat.grand) * 100).toFixed(1) + "%" : "0%",
                  ]),
                )
              }
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
          <ReportTable
            head={["Category", "Count", "Total", "% of total"]}
            rows={expenseByCat.rows.map((r) => [
              r.category,
              String(r.count),
              formatCurrency(r.total),
              expenseByCat.grand ? ((r.total / expenseByCat.grand) * 100).toFixed(1) + "%" : "0%",
            ])}
            empty="No expenses in this range."
            capitalizeFirst
          />
        </div>
      )}
    </div>
  );
}

function ReportTable({
  head,
  rows,
  empty,
  numericLast,
  capitalizeFirst,
}: {
  head: string[];
  rows: string[][];
  empty: string;
  numericLast?: boolean;
  capitalizeFirst?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          {head.map((h, i) => (
            <th key={h} className={cn("pb-2 font-medium", numericLast && i === head.length - 1 && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-slate-100">
            {r.map((c, ci) => (
              <td
                key={ci}
                className={cn(
                  "py-2",
                  ci === 0 && "font-medium",
                  ci === 0 && capitalizeFirst && "capitalize",
                  numericLast && ci === r.length - 1 && "text-right font-mono",
                )}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={head.length} className="py-6 text-center text-slate-400">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
