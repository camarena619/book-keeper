"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Play, Pause, RefreshCw, Pencil } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  RecurringInvoiceSchema,
  type RecurringInvoiceInput,
  FREQUENCIES,
  FREQUENCY_LABELS,
} from "@/lib/schemas/recurring";
import {
  createRecurringInvoice,
  updateRecurringInvoice,
  setRecurringStatus,
  deleteRecurringInvoice,
  generateNow,
} from "@/app/dashboard/recurring/actions";

export interface ClientOption {
  id: string;
  name: string;
}
export interface RecurringListItem {
  id: string;
  client_id: string;
  client_name: string;
  frequency: string;
  tax_rate_basis_points: number;
  due_days: number;
  auto_send: boolean;
  status: string;
  next_run_date: string;
  last_run_date: string | null;
  end_date: string | null;
  grand_total_cents: number;
  items: { title: string; description: string | null; amount: number }[];
}

export function RecurringInvoicesView({
  recurring,
  clients,
  canEdit,
}: {
  recurring: RecurringListItem[];
  clients: ClientOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [banner, setBanner] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function runGenerate() {
    setBanner("");
    setBusyId("__generate");
    const res = await generateNow();
    setBusyId(null);
    if (res.error) {
      setBanner(res.error);
      return;
    }
    setBanner(
      res.created
        ? `Generated ${res.created} invoice${res.created === 1 ? "" : "s"}.`
        : "Nothing due right now — all schedules are up to date.",
    );
    router.refresh();
  }

  async function toggle(item: RecurringListItem) {
    setBusyId(item.id);
    await setRecurringStatus(item.id, item.status === "active" ? "paused" : "active");
    setBusyId(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this recurring schedule? Past invoices it created are kept.")) return;
    setBusyId(id);
    await deleteRecurringInvoice(id);
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recurring Invoices</h1>
          <p className="text-sm text-slate-500">
            Templates that auto-generate invoices on a schedule. The generator runs
            daily; use “Generate due now” to run it immediately.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={runGenerate}
              disabled={busyId === "__generate"}
            >
              <RefreshCw
                className={cn("h-4 w-4", busyId === "__generate" && "animate-spin")}
              />
              Generate due now
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New schedule
            </button>
          </div>
        )}
      </div>

      {banner && (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">{banner}</div>
      )}

      <div className="card overflow-x-auto">
        {recurring.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No recurring schedules yet. Create one to bill a client automatically.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Client</th>
                <th>Frequency</th>
                <th>Next run</th>
                <th>Amount</th>
                <th>On generate</th>
                <th>Status</th>
                {canEdit && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{r.client_name}</td>
                  <td>{FREQUENCY_LABELS[r.frequency as keyof typeof FREQUENCY_LABELS] ?? r.frequency}</td>
                  <td>{formatDate(r.next_run_date)}</td>
                  <td className="font-mono">{formatCurrency(r.grand_total_cents)}</td>
                  <td>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      r.auto_send ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600",
                    )}>
                      {r.auto_send ? "Send" : "Draft"}
                    </span>
                  </td>
                  <td>
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      r.status === "active" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700",
                    )}>
                      {r.status}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                          title={r.status === "active" ? "Pause" : "Resume"}
                          onClick={() => toggle(r)}
                          disabled={busyId === r.id}
                        >
                          {r.status === "active" ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-200"
                          title="Edit"
                          onClick={() => setEditing(r)}
                          disabled={busyId === r.id}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded p-1.5 text-danger hover:bg-danger/10"
                          title="Delete"
                          onClick={() => remove(r.id)}
                          disabled={busyId === r.id}
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

      {(creating || editing) && (
        <RecurringBuilder
          clients={clients}
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function defaultStartDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function RecurringBuilder({
  clients,
  existing,
  onClose,
}: {
  clients: ClientOption[];
  existing: RecurringListItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecurringInvoiceInput>({
    resolver: zodResolver(RecurringInvoiceSchema),
    defaultValues: existing
      ? {
          client_id: existing.client_id,
          frequency: existing.frequency as RecurringInvoiceInput["frequency"],
          tax_rate_basis_points: existing.tax_rate_basis_points,
          due_days: existing.due_days,
          auto_send: existing.auto_send,
          next_run_date: existing.next_run_date,
          end_date: existing.end_date ?? "",
          items: existing.items.map((it) => ({
            title: it.title,
            description: it.description ?? "",
            amount: it.amount,
          })),
        }
      : {
          client_id: "",
          frequency: "monthly",
          tax_rate_basis_points: 0,
          due_days: 30,
          auto_send: false,
          next_run_date: defaultStartDate(),
          end_date: "",
          items: [{ title: "", description: "", amount: 0 }],
        },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchedItems = useWatch({ control, name: "items" });
  const watchedTax = useWatch({ control, name: "tax_rate_basis_points" });
  const subtotal = (watchedItems ?? []).reduce(
    (s, it) => s + Math.round((Number(it?.amount) || 0) * 100),
    0,
  );
  const tax = Math.round((subtotal * (Number(watchedTax) || 0)) / 10000);
  const total = subtotal + tax;

  async function onSubmit(values: RecurringInvoiceInput) {
    setServerError("");
    const result = existing
      ? await updateRecurringInvoice(existing.id, values)
      : await createRecurringInvoice(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-elev backdrop-blur-xl">
        <h3 className="mb-4 text-lg font-semibold">
          {existing ? "Edit recurring schedule" : "New recurring schedule"}
        </h3>
        {serverError && (
          <div className="mb-3 alert alert-danger">
            {serverError}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Client</label>
              <select className="input" {...register("client_id")}>
                <option value="">Select…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.client_id && (
                <p className="mt-1 text-xs text-danger">{errors.client_id.message}</p>
              )}
            </div>
            <div>
              <label className="label">Frequency</label>
              <select className="input" {...register("frequency")}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">First / next run date</label>
              <input type="date" className="input" {...register("next_run_date")} />
              {errors.next_run_date && (
                <p className="mt-1 text-xs text-danger">{errors.next_run_date.message}</p>
              )}
            </div>
            <div>
              <label className="label">End date (optional)</label>
              <input type="date" className="input" {...register("end_date")} />
            </div>
            <div>
              <label className="label">Due (days after generation)</label>
              <input
                type="number"
                min={0}
                max={365}
                className="input"
                {...register("due_days")}
              />
            </div>
            <div>
              <label className="label">Tax rate (basis points)</label>
              <input
                type="number"
                min={0}
                max={10000}
                className="input"
                {...register("tax_rate_basis_points")}
              />
              <p className="mt-1 text-xs text-slate-400">e.g. 950 = 9.5%</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("auto_send")} />
            Mark generated invoices as <strong>sent</strong> automatically (posts to
            the ledger). Otherwise they’re created as drafts for review.
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Line items</label>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-brand"
                onClick={() => append({ title: "", description: "", amount: 0 })}
              >
                <Plus className="h-4 w-4" /> Add line
              </button>
            </div>
            {errors.items?.message && (
              <p className="mb-2 text-xs text-danger">{errors.items.message}</p>
            )}
            <div className="flex flex-col gap-2">
              {fields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input
                      className="input"
                      placeholder="Title"
                      {...register(`items.${i}.title`)}
                    />
                    <input
                      className="input mt-1 text-xs"
                      placeholder="Description (optional)"
                      {...register(`items.${i}.description`)}
                    />
                    {errors.items?.[i]?.title && (
                      <p className="mt-0.5 text-xs text-danger">
                        {errors.items[i]?.title?.message}
                      </p>
                    )}
                  </div>
                  <div className="w-28">
                    <input
                      type="number"
                      step="0.01"
                      className="input font-mono"
                      placeholder="0.00"
                      {...register(`items.${i}.amount`)}
                    />
                  </div>
                  <button
                    type="button"
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100"
                    onClick={() => fields.length > 1 && remove(i)}
                    title="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-0.5 border-t border-slate-200 pt-3 text-sm">
            <div className="text-slate-500">
              Subtotal <span className="ml-4 font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="text-slate-500">
              Tax <span className="ml-4 font-mono">{formatCurrency(tax)}</span>
            </div>
            <div className="font-semibold">
              Total per invoice <span className="ml-4 font-mono">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : existing ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
