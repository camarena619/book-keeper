"use client";

import { useActionState, useEffect, useState } from "react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { createAccount, type CreateAccountState } from "@/app/dashboard/ledger/actions";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  is_system: boolean;
  balance: number;
}

export interface JournalEntryWithLines {
  id: string;
  entry_date: string;
  description: string;
  reference_source: string | null;
  lines: {
    id: string;
    entry_type: "debit" | "credit";
    amount_cents: number;
    account_code: string;
    account_name: string;
  }[];
}

const TYPE_BADGE: Record<AccountType, string> = {
  asset: "bg-sky-100 text-sky-700",
  liability: "bg-amber-100 text-amber-700",
  equity: "bg-violet-100 text-violet-700",
  revenue: "bg-green-100 text-green-700",
  expense: "bg-red-100 text-red-700",
};

const TABS = [
  { id: "coa", label: "Chart of Accounts" },
  { id: "journal", label: "Journal Entries" },
  { id: "reports", label: "Financial Statements" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function LedgerView({
  accounts,
  journalEntries,
  canAddAccount,
}: {
  accounts: LedgerAccount[];
  journalEntries: JournalEntryWithLines[];
  canAddAccount: boolean;
}) {
  const [tab, setTab] = useState<TabId>("coa");
  const [showAdd, setShowAdd] = useState(false);

  const sumByType = (t: AccountType) =>
    accounts.filter((a) => a.type === t).reduce((s, a) => s + a.balance, 0);

  const totalRevenue = sumByType("revenue");
  const totalExpense = sumByType("expense");
  const netIncome = totalRevenue - totalExpense;
  const totalAssets = sumByType("asset");
  const totalLiabilities = sumByType("liability");
  const totalEquity = sumByType("equity") + netIncome;
  const balanced = totalAssets === totalLiabilities + totalEquity;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">General Ledger</h1>
          <p className="text-sm text-slate-500">Double-entry accounting</p>
        </div>
        {tab === "coa" && canAddAccount && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add Account
          </button>
        )}
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "coa" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-2 font-medium">Code</th>
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="py-2 font-mono font-semibold">{a.code}</td>
                  <td className="py-2">{a.name}</td>
                  <td className="py-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", TYPE_BADGE[a.type])}>
                      {a.type}
                    </span>
                  </td>
                  <td className="py-2 text-xs text-slate-400">
                    {a.is_system ? "🔒 System" : "Custom"}
                  </td>
                  <td
                    className={cn(
                      "py-2 text-right font-mono font-semibold",
                      a.balance < 0 ? "text-danger" : "text-slate-900",
                    )}
                  >
                    {formatCurrency(Math.abs(a.balance))}
                    {a.balance < 0 && " (CR)"}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "journal" && (
        <div className="flex flex-col gap-4">
          {journalEntries.map((e) => {
            const debit = e.lines.filter((l) => l.entry_type === "debit").reduce((s, l) => s + l.amount_cents, 0);
            return (
              <div key={e.id} className="card">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{e.description}</div>
                    <div className="text-xs text-slate-400">
                      {formatDate(e.entry_date)} · {e.reference_source ?? "manual"}
                    </div>
                  </div>
                  <div className="font-mono text-sm text-slate-500">
                    {formatCurrency(debit)}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="font-medium">Account</th>
                      <th className="text-right font-medium">Debit</th>
                      <th className="text-right font-medium">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-1">
                          <span className="mr-2 font-mono text-slate-400">{l.account_code}</span>
                          {l.account_name}
                        </td>
                        <td className="py-1 text-right font-mono text-green-700">
                          {l.entry_type === "debit" ? formatCurrency(l.amount_cents) : "—"}
                        </td>
                        <td className="py-1 text-right font-mono text-amber-700">
                          {l.entry_type === "credit" ? formatCurrency(l.amount_cents) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {journalEntries.length === 0 && (
            <div className="card text-center text-slate-400">
              No journal entries yet. They post automatically when invoices are sent/paid and expenses are approved.
            </div>
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Profit & Loss */}
          <div className="card">
            <h2 className="mb-3 text-lg font-semibold">Profit &amp; Loss</h2>
            <Section title="Revenue" color="text-success" accounts={accounts.filter((a) => a.type === "revenue")} total={totalRevenue} />
            <Section title="Operating Expenses" color="text-danger" accounts={accounts.filter((a) => a.type === "expense")} total={totalExpense} />
            <SummaryRow label="Net Operating Income" value={netIncome} emphasis />
          </div>

          {/* Balance Sheet */}
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Balance Sheet</h2>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  balanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
                )}
              >
                {balanced ? "✓ Balanced" : "⚠ Out of balance"}
              </span>
            </div>
            <Section title="Assets" color="text-brand" accounts={accounts.filter((a) => a.type === "asset")} total={totalAssets} />
            <Section title="Liabilities" color="text-warning" accounts={accounts.filter((a) => a.type === "liability")} total={totalLiabilities} />
            <div>
              <div className="border-b border-slate-200 pb-1 text-sm font-bold text-violet-700">EQUITY</div>
              {accounts.filter((a) => a.type === "equity").map((a) => (
                <Row key={a.id} label={a.name} value={a.balance} />
              ))}
              <Row label="Retained Net Income (current period)" value={netIncome} muted />
              <div className="flex justify-between border-t border-dashed border-slate-200 py-2 text-sm font-semibold">
                <span>Total Equity</span>
                <span className="font-mono">{formatCurrency(totalEquity)}</span>
              </div>
            </div>
            <SummaryRow label="Total Liabilities & Equity" value={totalLiabilities + totalEquity} />
          </div>
        </div>
      )}

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function Section({
  title,
  color,
  accounts,
  total,
}: {
  title: string;
  color: string;
  accounts: LedgerAccount[];
  total: number;
}) {
  return (
    <div className="mb-4">
      <div className={cn("border-b border-slate-200 pb-1 text-sm font-bold uppercase", color)}>
        {title}
      </div>
      {accounts.map((a) => (
        <Row key={a.id} label={a.name} value={a.balance} />
      ))}
      <div className="flex justify-between border-t border-dashed border-slate-200 py-2 text-sm font-semibold">
        <span>Total {title}</span>
        <span className="font-mono">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between py-1.5 text-sm", muted && "italic text-slate-400")}>
      <span>{label}</span>
      <span className="font-mono">{formatCurrency(value)}</span>
    </div>
  );
}

function SummaryRow({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="font-bold">{label}</span>
      <span className={cn("font-mono font-bold", emphasis ? "text-xl text-brand" : "text-lg")}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState<CreateAccountState, FormData>(
    createAccount,
    {},
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Add Custom Account</h3>
        {state.error && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        <form action={formAction} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="type">Account type</label>
            <select id="type" name="type" className="input" defaultValue="expense">
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
              <option value="equity">Equity</option>
              <option value="revenue">Revenue</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="code">Account code (4 digits)</label>
            <input id="code" name="code" className="input font-mono" placeholder="5040" maxLength={4} required />
          </div>
          <div>
            <label className="label" htmlFor="name">Account name</label>
            <input id="name" name="name" className="input" placeholder="Subcontractor Fees" required />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
