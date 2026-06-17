"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import {
  EmployeeSchema,
  type EmployeeInput,
  PAY_TYPES,
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
  FILING_STATUSES,
  FILING_STATUS_LABELS,
} from "@/lib/schemas/employee";
import { saveEmployee, deleteEmployee } from "@/app/dashboard/payroll/employees/actions";
import { PayrollTabs } from "./PayrollTabs";

export interface Employee {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  ssn: string;
  pay_type: "salary" | "hourly";
  pay_rate: number;
  pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  federal_withholding_pct: number;
  state_withholding_pct: number;
  filing_status: "single" | "married" | "head_of_household";
  hire_date: string | null;
  status: "active" | "inactive";
}

function maskSsn(ssn: string): string {
  const d = ssn.replace(/\D/g, "");
  if (!d) return "—";
  return `•••-••-${d.slice(-4)}`;
}

export function EmployeesView({
  employees,
  canManage,
}: {
  employees: Employee[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(id: string) {
    if (!confirm("Delete this employee?")) return;
    setBusy(id);
    setError("");
    const res = await deleteEmployee(id);
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
          <h1 className="text-2xl font-bold">Payroll — Employees</h1>
          <p className="text-sm text-slate-500">
            W-2 employees and their pay setup. Pay runs (next step) use these to
            compute each paycheck.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add employee
          </button>
        )}
      </div>

      {!canManage && (
        <div className="rounded-md bg-amber-950/40 border border-amber-800/60 px-3 py-2 text-sm text-amber-200">
          Payroll is managed by owners and admins. You have read-only access.
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-950/40 border border-red-800/60 px-3 py-2 text-sm text-red-200">{error}</div>
      )}

      <div className="card overflow-x-auto">
        {employees.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No employees yet. Add one to start running payroll.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Employee</th>
                <th>SSN</th>
                <th>Pay</th>
                <th>Frequency</th>
                <th>Withholding (Fed/State)</th>
                <th>Status</th>
                {canManage && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <div className="font-medium">{e.name}</div>
                    {e.email && <div className="text-xs text-slate-400">{e.email}</div>}
                  </td>
                  <td className="font-mono">{maskSsn(e.ssn)}</td>
                  <td className="font-mono">
                    {formatCurrency(Math.round(e.pay_rate * 100))}
                    <span className="text-xs text-slate-400">
                      {e.pay_type === "salary" ? "/yr" : "/hr"}
                    </span>
                  </td>
                  <td>{PAY_FREQUENCY_LABELS[e.pay_frequency]}</td>
                  <td className="font-mono">
                    {e.federal_withholding_pct}% / {e.state_withholding_pct}%
                  </td>
                  <td>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs border",
                        e.status === "active"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-slate-200 text-slate-400 border-line",
                      )}
                    >
                      {e.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-200"
                          title="Edit"
                          onClick={() => setEditing(e)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded p-1.5 text-danger hover:bg-danger/10"
                          title="Delete"
                          onClick={() => remove(e.id)}
                          disabled={busy === e.id}
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

      <p className="flex items-start gap-2 text-xs text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        SSNs are encrypted (AES-256-GCM) on the server and only shown masked.
        Income-tax withholding is an estimated percentage you set — this tool does
        not file or remit payroll taxes.
      </p>

      {(adding || editing) && (
        <EmployeeDialog
          existing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function EmployeeDialog({
  existing,
  onClose,
}: {
  existing: Employee | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmployeeInput>({
    resolver: zodResolver(EmployeeSchema),
    defaultValues: existing
      ? {
          employee_id: existing.id,
          name: existing.name,
          email: existing.email ?? "",
          address: existing.address ?? "",
          ssn: existing.ssn,
          pay_type: existing.pay_type,
          pay_rate: existing.pay_rate,
          pay_frequency: existing.pay_frequency,
          federal_withholding_pct: existing.federal_withholding_pct,
          state_withholding_pct: existing.state_withholding_pct,
          filing_status: existing.filing_status,
          hire_date: existing.hire_date ?? "",
          status: existing.status,
        }
      : {
          name: "",
          email: "",
          address: "",
          ssn: "",
          pay_type: "salary",
          pay_rate: 0,
          pay_frequency: "biweekly",
          federal_withholding_pct: 10,
          state_withholding_pct: 4,
          filing_status: "single",
          hire_date: "",
          status: "active",
        },
  });

  const payType = useWatch({ control, name: "pay_type" });

  async function onSubmit(values: EmployeeInput) {
    setServerError("");
    const res = await saveEmployee(values);
    if (res.error) {
      setServerError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-slate-100/90 p-6 shadow-elev backdrop-blur-xl">
        <h3 className="mb-4 text-lg font-semibold">
          {existing ? "Edit employee" : "Add employee"}
        </h3>
        {serverError && (
          <div className="mb-3 rounded-md bg-red-950/40 border border-red-800/60 px-3 py-2 text-sm text-red-200">
            {serverError}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("employee_id")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Name</label>
              <input className="input" {...register("name")} />
              {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input className="input" type="email" {...register("email")} />
              {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">SSN</label>
              <input className="input font-mono" placeholder="123-45-6789" {...register("ssn")} />
            </div>
            <div>
              <label className="label">Hire date (optional)</label>
              <input type="date" className="input" {...register("hire_date")} />
            </div>
          </div>

          <div>
            <label className="label">Address (optional)</label>
            <textarea className="input" rows={2} {...register("address")} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Pay type</label>
              <select className="input capitalize" {...register("pay_type")}>
                {PAY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                {payType === "hourly" ? "Hourly rate ($)" : "Annual salary ($)"}
              </label>
              <input
                type="number"
                step="0.01"
                className="input font-mono"
                {...register("pay_rate")}
              />
              {errors.pay_rate && (
                <p className="mt-1 text-xs text-danger">{errors.pay_rate.message}</p>
              )}
            </div>
            <div>
              <label className="label">Pay frequency</label>
              <select className="input" {...register("pay_frequency")}>
                {PAY_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {PAY_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Federal withholding (%)</label>
              <input
                type="number"
                step="0.1"
                className="input font-mono"
                {...register("federal_withholding_pct")}
              />
            </div>
            <div>
              <label className="label">State withholding (%)</label>
              <input
                type="number"
                step="0.1"
                className="input font-mono"
                {...register("state_withholding_pct")}
              />
            </div>
            <div>
              <label className="label">Filing status</label>
              <select className="input" {...register("filing_status")}>
                {FILING_STATUSES.map((f) => (
                  <option key={f} value={f}>
                    {FILING_STATUS_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="sm:w-1/3">
            <label className="label">Status</label>
            <select className="input capitalize" {...register("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (excluded from pay runs)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : existing ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
