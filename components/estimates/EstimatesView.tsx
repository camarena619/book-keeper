"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { EstimateSchema, type EstimateInput } from "@/lib/schemas/estimate";
import {
  createEstimate,
  updateEstimateStatus,
  convertEstimate,
} from "@/app/dashboard/estimates/actions";

export interface EstimateListItem {
  quote_id: string;
  quote_number: string;
  client_name: string | null;
  status: string;
  valid_until: string | null;
  created_at: string;
  subtotal_cents: number;
  tax_cents: number;
  grand_total_cents: number;
}
export interface ClientOption {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-500 border border-line",
  sent: "bg-brand/15 text-brand border border-brand/30",
  accepted: "bg-success/15 text-success border border-success/30",
  declined: "bg-danger/15 text-danger border border-danger/30",
  converted: "bg-brand/15 text-brand-accent border border-brand/30",
};

export function EstimatesView({
  estimates,
  clients,
  canEdit,
  nextNumber,
}: {
  estimates: EstimateListItem[];
  clients: ClientOption[];
  canEdit: boolean;
  nextNumber: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function setStatus(id: string, status: "sent" | "accepted" | "declined") {
    startTransition(async () => {
      const r = await updateEstimateStatus(id, status);
      if (r.error) setError(r.error);
      router.refresh();
    });
  }
  function convert(id: string) {
    startTransition(async () => {
      const r = await convertEstimate(id);
      if (r.error) setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estimates</h1>
          <p className="text-sm text-slate-500">Quotes &amp; proposals</p>
        </div>
        {canEdit && (
          <button
            className="btn-primary"
            onClick={() => setShowForm(true)}
            disabled={clients.length === 0}
            title={clients.length === 0 ? "Add a contact first" : undefined}
          >
            + New Estimate
          </button>
        )}
      </header>

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-2 font-medium">Estimate #</th>
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Valid until</th>
              <th className="pb-2 text-right font-medium">Total</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {estimates.map((q) => (
              <tr key={q.quote_id} className="border-b border-slate-100">
                <td className="py-2 font-mono">{q.quote_number}</td>
                <td className="py-2">{q.client_name}</td>
                <td className="py-2">{q.valid_until ? formatDate(q.valid_until) : "—"}</td>
                <td className="py-2 text-right font-mono font-semibold">
                  {formatCurrency(q.grand_total_cents)}
                </td>
                <td className="py-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", STATUS_BADGE[q.status] ?? "bg-slate-100")}>
                    {q.status}
                  </span>
                </td>
                <td className="py-2">
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      {q.status === "draft" && (
                        <button className="rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10" onClick={() => setStatus(q.quote_id, "sent")} disabled={pending}>
                          Send
                        </button>
                      )}
                      {q.status === "sent" && (
                        <>
                          <button className="rounded px-2 py-1 text-xs font-medium text-success hover:bg-success/15" onClick={() => setStatus(q.quote_id, "accepted")} disabled={pending}>
                            Accept
                          </button>
                          <button className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10" onClick={() => setStatus(q.quote_id, "declined")} disabled={pending}>
                            Decline
                          </button>
                        </>
                      )}
                      {(q.status === "accepted" || q.status === "sent") && (
                        <button className="rounded px-2 py-1 text-xs font-medium text-brand-accent hover:bg-brand-soft" onClick={() => convert(q.quote_id)} disabled={pending}>
                          → Invoice
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {estimates.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  No estimates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <EstimateBuilder clients={clients} nextNumber={nextNumber} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function EstimateBuilder({
  clients,
  nextNumber,
  onClose,
}: {
  clients: ClientOption[];
  nextNumber: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EstimateInput>({
    resolver: zodResolver(EstimateSchema),
    defaultValues: {
      client_id: "",
      quote_number: nextNumber,
      valid_until: defaultValidUntil(),
      tax_rate_basis_points: 0,
      items: [{ title: "", description: "", amount: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const items = useWatch({ control, name: "items" });
  const taxBp = useWatch({ control, name: "tax_rate_basis_points" });
  const subtotal = (items ?? []).reduce((s, it) => s + Math.round((Number(it?.amount) || 0) * 100), 0);
  const tax = Math.round((subtotal * (Number(taxBp) || 0)) / 10000);
  const total = subtotal + tax;

  async function onSubmit(values: EstimateInput) {
    setServerError("");
    const result = await createEstimate(values);
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
        <h3 className="mb-4 text-lg font-semibold">New Estimate</h3>
        {serverError && (
          <div className="mb-3 alert alert-danger">{serverError}</div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Client</label>
              <select className="input" {...register("client_id")}>
                <option value="">Select…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {errors.client_id && <p className="mt-1 text-xs text-danger">{errors.client_id.message}</p>}
            </div>
            <div>
              <label className="label">Estimate #</label>
              <input className="input font-mono" {...register("quote_number")} />
            </div>
            <div>
              <label className="label">Valid until</label>
              <input type="date" className="input" {...register("valid_until")} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label mb-0">Line items</label>
              <button type="button" className="inline-flex items-center gap-1 text-sm text-brand" onClick={() => append({ title: "", description: "", amount: 0 })}>
                <Plus className="h-4 w-4" /> Add line
              </button>
            </div>
            {errors.items?.message && <p className="mb-2 text-xs text-danger">{errors.items.message}</p>}
            <div className="flex flex-col gap-2">
              {fields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <div className="flex-1">
                    <input className="input" placeholder="Title" {...register(`items.${i}.title`)} />
                    <input className="input mt-1 text-xs" placeholder="Description (optional)" {...register(`items.${i}.description`)} />
                    {errors.items?.[i]?.title && <p className="mt-0.5 text-xs text-danger">{errors.items[i]?.title?.message}</p>}
                  </div>
                  <div className="w-28">
                    <input type="number" step="0.01" className="input font-mono" placeholder="0.00" {...register(`items.${i}.amount`, { valueAsNumber: true })} />
                    {errors.items?.[i]?.amount && <p className="mt-0.5 text-xs text-danger">{errors.items[i]?.amount?.message}</p>}
                  </div>
                  <button type="button" className="self-start rounded p-2 text-red-500 hover:bg-danger/10 disabled:opacity-30" onClick={() => remove(i)} disabled={fields.length === 1} aria-label="Remove line">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-slate-200 pt-4">
            <div className="w-40">
              <label className="label">Tax (basis points)</label>
              <input type="number" className="input font-mono" placeholder="825 = 8.25%" {...register("tax_rate_basis_points", { valueAsNumber: true })} />
            </div>
            <div className="text-right text-sm">
              <div className="text-slate-500">Subtotal: <span className="font-mono">{formatCurrency(subtotal)}</span></div>
              <div className="text-slate-500">Tax: <span className="font-mono">{formatCurrency(tax)}</span></div>
              <div className="text-lg font-bold">Total: <span className="font-mono">{formatCurrency(total)}</span></div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Create Estimate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
