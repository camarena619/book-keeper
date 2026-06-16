"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, X, Building2, ShieldCheck } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import {
  ContractorSchema,
  PayerInfoSchema,
  type ContractorInput,
  type PayerInfoInput,
} from "@/lib/schemas/contractor";
import {
  saveContractor,
  unmarkContractor,
  savePayerInfo,
} from "@/app/dashboard/tax/actions";

const Form1099DownloadButton = dynamic(() => import("./Form1099DownloadButton"), {
  ssr: false,
  loading: () => <span className="btn-secondary opacity-60">…</span>,
});

// IRS reporting threshold for 1099-NEC: $600.
const THRESHOLD_CENTS = 60000;

export interface Contractor {
  supplier_id: string;
  name: string;
  legal_name: string | null;
  email: string | null;
  address: string | null;
  tax_id: string;
  total_paid_cents: number;
}
export interface PayerInfo {
  legal_name: string;
  address: string;
  ein: string;
}

function maskTin(tin: string): string {
  const digits = tin.replace(/\D/g, "");
  if (!digits) return "—";
  return `•••-••-${digits.slice(-4)}`;
}

export function TaxFormsView({
  contractors,
  payer,
  year,
  currentYear,
  canManage,
}: {
  contractors: Contractor[];
  payer: PayerInfo;
  year: number;
  currentYear: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingPayer, setEditingPayer] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const reportableCount = contractors.filter(
    (c) => c.total_paid_cents >= THRESHOLD_CENTS,
  ).length;
  const payerReady = !!payer.ein && !!payer.address;

  async function unmark(id: string) {
    if (!confirm("Remove the 1099 flag from this contractor? Their expense history is kept."))
      return;
    setBusy(id);
    await unmarkContractor(id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">1099-NEC Contractors</h1>
          <p className="text-sm text-slate-500">
            Contractors you’ve paid for services. Anyone paid{" "}
            <strong>{formatCurrency(THRESHOLD_CENTS)}+</strong> in a year needs a
            1099-NEC. Totals come from approved expenses linked to each contractor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Tax year</label>
          <select
            className="input w-auto"
            value={year}
            onChange={(e) => router.push(`/dashboard/tax?year=${e.target.value}`)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Payer (your business) card */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-brand" />
            <div>
              <div className="text-sm font-semibold">Payer (your business)</div>
              <div className="mt-1 text-sm text-slate-600">{payer.legal_name}</div>
              <div className="text-sm text-slate-500">
                {payer.address || <span className="italic text-amber-600">Address not set</span>}
              </div>
              <div className="text-sm text-slate-500">
                EIN:{" "}
                {payer.ein ? (
                  <span className="font-mono">{maskTin(payer.ein)}</span>
                ) : (
                  <span className="italic text-amber-600">not set</span>
                )}
              </div>
            </div>
          </div>
          {canManage && (
            <button className="btn-secondary" onClick={() => setEditingPayer(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
        </div>
        {!payerReady && (
          <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Add your business EIN and address before generating 1099 forms — they
            appear in the payer box.
          </div>
        )}
      </div>

      {/* Contractors */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {contractors.length} contractor{contractors.length === 1 ? "" : "s"} ·{" "}
          {reportableCount} reportable for {year}
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add contractor
          </button>
        )}
      </div>

      <div className="card overflow-x-auto">
        {contractors.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No 1099 contractors yet. Add one, then link expenses to them so their
            yearly total accumulates.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="py-2">Contractor</th>
                <th>TIN</th>
                <th>Paid in {year}</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c) => {
                const reportable = c.total_paid_cents >= THRESHOLD_CENTS;
                const w9Complete = !!c.tax_id && !!c.address;
                return (
                  <tr key={c.supplier_id} className="border-b border-slate-100">
                    <td className="py-2">
                      <div className="font-medium">{c.legal_name || c.name}</div>
                      {c.email && <div className="text-xs text-slate-400">{c.email}</div>}
                    </td>
                    <td className="font-mono">{maskTin(c.tax_id)}</td>
                    <td className="font-mono">{formatCurrency(c.total_paid_cents)}</td>
                    <td>
                      {reportable ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          Reportable
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          Under {formatCurrency(THRESHOLD_CENTS)}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-2">
                        {reportable &&
                          (w9Complete && payerReady ? (
                            <Form1099DownloadButton
                              data={{
                                year,
                                payer,
                                recipient: {
                                  name: c.name,
                                  legal_name: c.legal_name,
                                  address: c.address,
                                  tax_id: c.tax_id,
                                },
                                amount_cents: c.total_paid_cents,
                              }}
                            />
                          ) : (
                            <span
                              className="text-xs text-amber-600"
                              title="Complete the contractor's W-9 (TIN + address) and your payer EIN/address"
                            >
                              W-9 incomplete
                            </span>
                          ))}
                        {canManage && (
                          <>
                            <button
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                              title="Edit W-9"
                              onClick={() => setEditing(c)}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                              title="Remove 1099 flag"
                              onClick={() => unmark(c.supplier_id)}
                              disabled={busy === c.supplier_id}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Tax IDs are encrypted (AES-256-GCM) on the server and only ever shown
        masked. Generated forms are informational copies — file the official
        return via the IRS or an approved e-file provider.
      </p>

      {editingPayer && (
        <PayerDialog payer={payer} onClose={() => setEditingPayer(false)} />
      )}
      {(adding || editing) && (
        <ContractorDialog
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

function PayerDialog({ payer, onClose }: { payer: PayerInfo; onClose: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<PayerInfoInput>({
    resolver: zodResolver(PayerInfoSchema),
    defaultValues: { ein: payer.ein, address: payer.address },
  });

  async function onSubmit(values: PayerInfoInput) {
    setServerError("");
    const res = await savePayerInfo(values);
    if (res.error) {
      setServerError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal title="Payer tax info" onClose={onClose}>
      {serverError && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label className="label">Business legal name</label>
          <input className="input bg-slate-50" value={payer.legal_name} disabled />
          <p className="mt-1 text-xs text-slate-400">Edit this in Settings.</p>
        </div>
        <div>
          <label className="label">EIN</label>
          <input className="input font-mono" placeholder="12-3456789" {...register("ein")} />
        </div>
        <div>
          <label className="label">Business address</label>
          <textarea className="input" rows={2} {...register("address")} />
        </div>
        <DialogButtons isSubmitting={isSubmitting} onClose={onClose} label="Save" />
      </form>
    </Modal>
  );
}

function ContractorDialog({
  existing,
  onClose,
}: {
  existing: Contractor | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContractorInput>({
    resolver: zodResolver(ContractorSchema),
    defaultValues: existing
      ? {
          supplier_id: existing.supplier_id,
          name: existing.name,
          legal_name: existing.legal_name ?? "",
          tax_id: existing.tax_id,
          address: existing.address ?? "",
          email: existing.email ?? "",
        }
      : { name: "", legal_name: "", tax_id: "", address: "", email: "" },
  });

  async function onSubmit(values: ContractorInput) {
    setServerError("");
    const res = await saveContractor(values);
    if (res.error) {
      setServerError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal title={existing ? "Edit contractor (W-9)" : "Add contractor"} onClose={onClose}>
      {serverError && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <input type="hidden" {...register("supplier_id")} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Display name</label>
            <input className="input" {...register("name")} />
            {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Legal name (per W-9)</label>
            <input className="input" {...register("legal_name")} />
          </div>
        </div>
        <div>
          <label className="label">Tax ID (SSN or EIN)</label>
          <input className="input font-mono" placeholder="123-45-6789" {...register("tax_id")} />
          <p className="mt-1 text-xs text-slate-400">Encrypted on save; shown masked elsewhere.</p>
        </div>
        <div>
          <label className="label">Address</label>
          <textarea className="input" rows={2} {...register("address")} />
        </div>
        <div>
          <label className="label">Email (optional)</label>
          <input className="input" type="email" {...register("email")} />
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>
        <DialogButtons isSubmitting={isSubmitting} onClose={onClose} label={existing ? "Save" : "Add"} />
      </form>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function DialogButtons({
  isSubmitting,
  onClose,
  label,
}: {
  isSubmitting: boolean;
  onClose: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : label}
      </button>
    </div>
  );
}
