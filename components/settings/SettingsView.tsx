"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { OrgSettingsSchema, type OrgSettingsInput } from "@/lib/schemas/org";
import { updateOrgSettings } from "@/app/(dashboard)/settings/actions";

export function SettingsView({
  initial,
  isOwner,
}: {
  initial: OrgSettingsInput;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrgSettingsInput>({
    resolver: zodResolver(OrgSettingsSchema),
    defaultValues: initial,
  });

  async function onSubmit(values: OrgSettingsInput) {
    setServerError("");
    setSaved(false);
    const result = await updateOrgSettings(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Routing &amp; account numbers are encrypted with AES-256-GCM on the
          server before being stored. The encryption key never reaches the
          browser.
        </span>
      </div>

      {!isOwner && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Only the organization owner can edit these settings. Fields are
          read-only.
        </div>
      )}
      {serverError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Settings saved.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card flex flex-col gap-4">
        <div>
          <label className="label">Business name</label>
          <input className="input" disabled={!isOwner} {...register("name")} />
          {errors.name && <p className="mt-1 text-xs text-danger">{errors.name.message}</p>}
        </div>
        <div>
          <label className="label">Billing email</label>
          <input
            type="email"
            className="input"
            disabled={!isOwner}
            {...register("billing_email")}
          />
          {errors.billing_email && (
            <p className="mt-1 text-xs text-danger">{errors.billing_email.message}</p>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Direct ACH (encrypted)
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Routing number</label>
              <input
                className="input font-mono"
                inputMode="numeric"
                placeholder="9 digits"
                disabled={!isOwner}
                {...register("routing_number")}
              />
              {errors.routing_number && (
                <p className="mt-1 text-xs text-danger">{errors.routing_number.message}</p>
              )}
            </div>
            <div>
              <label className="label">Account number</label>
              <input
                className="input font-mono"
                inputMode="numeric"
                placeholder="4–17 digits"
                disabled={!isOwner}
                {...register("account_number")}
              />
              {errors.account_number && (
                <p className="mt-1 text-xs text-danger">{errors.account_number.message}</p>
              )}
            </div>
          </div>
        </div>

        {isOwner && (
          <div>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
