"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { InvoiceSchema, type InvoiceInput } from "@/lib/schemas/invoice";
import { createInvoice, updateInvoiceStatus } from "@/app/(dashboard)/invoices/actions";

const PdfDownloadButton = dynamic(() => import("./PdfDownloadButton"), {
  ssr: false,
  loading: () => <span className="px-1.5 text-xs text-slate-400">PDF</span>,
});

export interface InvoiceListItem {
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  client_email: string | null;
  client_address: string | null;
  status: string;
  due_date: string;
  subtotal_cents: number;
  tax_cents: number;
  grand_total_cents: number;
  items: { title: string; description: string | null; total_cents: number }[];
}

export interface ClientOption {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-sky-100 text-sky-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-500",
};

export function InvoicesView({
  invoices,
  clients,
  org,
  canEdit,
  nextNumber,
}: {
  invoices: InvoiceListItem[];
  clients: ClientOption[];
  org: { name: string; email: string | null };
  canEdit: boolean;
  nextNumber: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeStatus(id: string, status: "sent" | "paid") {
    startTransition(async () => {
      await updateInvoiceStatus(id, status);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-slate-500">Billing &amp; receivables</p>
        </div>
        {canEdit && (
          <button
            className="btn-primary"
            onClick={() => setShowForm(true)}
            disabled={clients.length === 0}
            title={clients.length === 0 ? "Add a contact first" : undefined}
          >
            + New Invoice
          </button>
        )}
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-2 font-medium">Invoice #</th>
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Due</th>
              <th className="pb-2 text-right font-medium">Total</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.invoice_id} className="border-b border-slate-100">
                <td className="py-2 font-mono">{inv.invoice_number}</td>
                <td className="py-2">{inv.client_name}</td>
                <td className="py-2">{formatDate(inv.due_date)}</td>
                <td className="py-2 text-right font-mono font-semibold">
                  {formatCurrency(inv.grand_total_cents)}
                </td>
                <td className="py-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs capitalize",
                      STATUS_BADGE[inv.status] ?? "bg-slate-100",
                    )}
                  >
                    {inv.status}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-1">
                    {canEdit && inv.status === "draft" && (
                      <button
                        className="rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10"
                        onClick={() => changeStatus(inv.invoice_id, "sent")}
                        disabled={pending}
                      >
                        Send
                      </button>
                    )}
                    {canEdit &&
                      (inv.status === "sent" || inv.status === "overdue") && (
                        <button
                          className="rounded px-2 py-1 text-xs font-medium text-success hover:bg-green-50"
                          onClick={() => changeStatus(inv.invoice_id, "paid")}
                          disabled={pending}
                        >
                          Mark Paid
                        </button>
                      )}
                    <PdfDownloadButton
                      data={{
                        org,
                        client: {
                          name: inv.client_name ?? "",
                          email: inv.client_email,
                          address: inv.client_address,
                        },
                        invoice: {
                          invoice_number: inv.invoice_number,
                          due_date: inv.due_date,
                          subtotal_cents: inv.subtotal_cents,
                          tax_cents: inv.tax_cents,
                          grand_total_cents: inv.grand_total_cents,
                        },
                        items: inv.items,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400">
                  No invoices yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <InvoiceBuilder
          clients={clients}
          nextNumber={nextNumber}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function InvoiceBuilder({
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
  } = useForm<InvoiceInput>({
    resolver: zodResolver(InvoiceSchema),
    defaultValues: {
      client_id: "",
      invoice_number: nextNumber,
      due_date: defaultDueDate(),
      tax_rate_basis_points: 0,
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

  async function onSubmit(values: InvoiceInput) {
    setServerError("");
    const result = await createInvoice(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">New Invoice</h3>
        {serverError && (
          <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
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
              <label className="label">Invoice #</label>
              <input className="input font-mono" {...register("invoice_number")} />
            </div>
            <div>
              <label className="label">Due date</label>
              <input type="date" className="input" {...register("due_date")} />
            </div>
          </div>

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
                      {...register(`items.${i}.amount`, { valueAsNumber: true })}
                    />
                    {errors.items?.[i]?.amount && (
                      <p className="mt-0.5 text-xs text-danger">
                        {errors.items[i]?.amount?.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="self-start rounded p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                    onClick={() => remove(i)}
                    disabled={fields.length === 1}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-slate-200 pt-4">
            <div className="w-40">
              <label className="label">Tax (basis points)</label>
              <input
                type="number"
                className="input font-mono"
                placeholder="825 = 8.25%"
                {...register("tax_rate_basis_points", { valueAsNumber: true })}
              />
            </div>
            <div className="text-right text-sm">
              <div className="text-slate-500">
                Subtotal: <span className="font-mono">{formatCurrency(subtotal)}</span>
              </div>
              <div className="text-slate-500">
                Tax: <span className="font-mono">{formatCurrency(tax)}</span>
              </div>
              <div className="text-lg font-bold">
                Total: <span className="font-mono">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Create Draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
