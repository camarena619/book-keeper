"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { computePay } from "@/lib/payroll";
import {
  createPayRun,
  postPayRun,
  deletePayRun,
} from "@/app/dashboard/payroll/actions";
import { PayrollTabs } from "./PayrollTabs";

export interface PayRunListItem {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  gross_cents: number;
  net_cents: number;
}
export interface PayrollEmployee {
  id: string;
  name: string;
  pay_type: "salary" | "hourly";
  pay_rate_cents: number;
  pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  federal_withholding_bp: number;
  state_withholding_bp: number;
  ytd_ss_wages_cents: number;
}

export function PayrollView({
  payRuns,
  employees,
  canManage,
}: {
  payRuns: PayRunListItem[];
  employees: PayrollEmployee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function post(id: string) {
    setBusy(id);
    setError("");
    const res = await postPayRun(id);
    setBusy(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function remove(id: string, posted: boolean) {
    if (
      !confirm(
        posted
          ? "Delete this posted pay run? Its ledger entry will be reversed."
          : "Delete this draft pay run?",
      )
    )
      return;
    setBusy(id);
    setError("");
    const res = await deletePayRun(id);
    setBusy(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <PayrollTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payroll — Pay Runs</h1>
          <p className="text-sm text-slate-500">
            Create a pay run, review each paycheck, then post it to the ledger.
          </p>
        </div>
        {canManage && (
          <button
            className="btn-primary"
            onClick={() => {
              setError("");
              setCreating(true);
            }}
            disabled={employees.length === 0}
            title={employees.length === 0 ? "Add an active employee first" : undefined}
          >
            <Plus className="h-4 w-4" /> New pay run
          </button>
        )}
      </div>

      {employees.length === 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No active employees yet. Add one on the Employees tab to run payroll.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="card overflow-x-auto">
        {payRuns.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No pay runs yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Pay date</th>
                <th>Period</th>
                <th>Gross</th>
                <th>Net</th>
                <th>Status</th>
                {canManage && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {payRuns.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">
                    <Link href={`/dashboard/payroll/${r.id}`} className="text-brand hover:underline">
                      {formatDate(r.pay_date)}
                    </Link>
                  </td>
                  <td className="text-slate-500">
                    {formatDate(r.period_start)} – {formatDate(r.period_end)}
                  </td>
                  <td className="font-mono">{formatCurrency(r.gross_cents)}</td>
                  <td className="font-mono">{formatCurrency(r.net_cents)}</td>
                  <td>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        r.status === "posted"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "draft" && (
                          <button
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                            onClick={() => post(r.id)}
                            disabled={busy === r.id}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Post
                          </button>
                        )}
                        <button
                          className="rounded p-1.5 text-danger hover:bg-red-50"
                          title="Delete"
                          onClick={() => remove(r.id, r.status === "posted")}
                          disabled={busy === r.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <NewPayRunDialog employees={employees} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function NewPayRunDialog({
  employees,
  onClose,
}: {
  employees: PayrollEmployee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [sel, setSel] = useState<Record<string, { on: boolean; hours: number }>>(
    Object.fromEntries(employees.map((e) => [e.id, { on: true, hours: 0 }])),
  );
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () =>
      employees.map((e) => {
        const s = sel[e.id] ?? { on: false, hours: 0 };
        const pay = computePay({
          pay_type: e.pay_type,
          pay_rate_cents: e.pay_rate_cents,
          pay_frequency: e.pay_frequency,
          federal_withholding_bp: e.federal_withholding_bp,
          state_withholding_bp: e.state_withholding_bp,
          hours: s.hours,
          ytd_ss_wages_cents: e.ytd_ss_wages_cents,
        });
        return { e, s, pay };
      }),
    [employees, sel],
  );

  const totals = rows.reduce(
    (acc, { s, pay }) => {
      if (!s.on) return acc;
      acc.gross += pay.gross_cents;
      acc.net += pay.net_cents;
      return acc;
    },
    { gross: 0, net: 0 },
  );

  async function submit() {
    setServerError("");
    if (!periodStart || !periodEnd || !payDate) {
      setServerError("Fill in the period and pay date.");
      return;
    }
    const lines = rows
      .filter((r) => r.s.on)
      .map((r) => ({ employee_id: r.e.id, hours: r.s.hours }));
    if (lines.length === 0) {
      setServerError("Select at least one employee.");
      return;
    }
    setSaving(true);
    const res = await createPayRun({
      period_start: periodStart,
      period_end: periodEnd,
      pay_date: payDate,
      lines,
    });
    setSaving(false);
    if (res.error) {
      setServerError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">New pay run</h3>
        {serverError && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Period start</label>
            <input
              type="date"
              className="input"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Period end</label>
            <input
              type="date"
              className="input"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Pay date</label>
            <input
              type="date"
              className="input"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-400">
                <th className="p-2">Pay</th>
                <th>Employee</th>
                <th>Hours</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Taxes</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, s, pay }) => {
                const taxes =
                  pay.federal_tax_cents +
                  pay.state_tax_cents +
                  pay.social_security_cents +
                  pay.medicare_cents;
                return (
                  <tr key={e.id} className={cn("border-b border-slate-100", !s.on && "opacity-40")}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={s.on}
                        onChange={(ev) =>
                          setSel((p) => ({ ...p, [e.id]: { ...s, on: ev.target.checked } }))
                        }
                      />
                    </td>
                    <td>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-slate-400 capitalize">{e.pay_type}</div>
                    </td>
                    <td>
                      {e.pay_type === "hourly" ? (
                        <input
                          type="number"
                          step="0.25"
                          min={0}
                          className="input w-20"
                          value={s.hours || ""}
                          onChange={(ev) =>
                            setSel((p) => ({
                              ...p,
                              [e.id]: { ...s, hours: Number(ev.target.value) || 0 },
                            }))
                          }
                        />
                      ) : (
                        <span className="text-xs text-slate-400">salary</span>
                      )}
                    </td>
                    <td className="text-right font-mono">{formatCurrency(pay.gross_cents)}</td>
                    <td className="text-right font-mono text-slate-500">
                      {formatCurrency(taxes)}
                    </td>
                    <td className="text-right font-mono font-semibold">
                      {formatCurrency(pay.net_cents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="p-2" colSpan={3}>
                  Totals
                </td>
                <td className="text-right font-mono">{formatCurrency(totals.gross)}</td>
                <td />
                <td className="text-right font-mono">{formatCurrency(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          FICA is calculated automatically (SS 6.2% / Medicare 1.45%); federal &amp;
          state use each employee’s set withholding %. Creates a draft you can
          review before posting.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
