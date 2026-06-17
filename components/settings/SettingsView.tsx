"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { OrgSettingsSchema, type OrgSettingsInput } from "@/lib/schemas/org";
import { updateOrgSettings } from "@/app/dashboard/settings/actions";
import { ReAuthModal, useReAuth } from "@/components/security/ReAuthModal";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cn } from "@/lib/utils";

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
  const { showReAuth, actionDescription, requestReAuth, handleReAuthResult } =
    useReAuth();
  const { theme, toggleTheme } = useTheme();
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

    // Changing stored bank/ACH details is sensitive — require step-up auth.
    const bankChanged =
      values.routing_number !== initial.routing_number ||
      values.account_number !== initial.account_number;
    if (bankChanged) {
      const verified = await requestReAuth("Update bank account (ACH) details");
      if (!verified) {
        setServerError("Identity not verified — your changes were not saved.");
        return;
      }
    }

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
      <ReAuthModal
        isOpen={showReAuth}
        actionDescription={actionDescription}
        onResult={handleReAuthResult}
      />
      <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Routing &amp; account numbers are encrypted with AES-256-GCM on the
          server before being stored. The encryption key never reaches the
          browser.
        </span>
      </div>

      {!isOwner && (
        <div className="rounded-md bg-amber-950/40 border border-amber-800/60 px-3 py-2 text-sm text-amber-200">
          Only the organization owner can edit these settings. Fields are
          read-only.
        </div>
      )}
      {serverError && (
        <div className="rounded-md bg-red-950/40 border border-red-800/60 px-3 py-2 text-sm text-red-200">
          {serverError}
        </div>
      )}
      {saved && (
        <div className="rounded-md bg-green-950/40 border border-green-800/60 px-3 py-2 text-sm text-green-200">
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

        <div className="border-t border-line pt-4">
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

        <div className="border-t border-line pt-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            App Preferences
          </h2>
          <div className="flex items-center justify-between rounded-lg border border-line bg-slate-100 p-4">
            <div>
              <div className="text-sm font-medium text-slate-900">Dark Theme</div>
              <div className="text-xs text-slate-500">
                Toggle between light and dark modes for Nexus Ledger
              </div>
            </div>
            <button
              type="button"
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-canvas",
                theme === "dark" ? "bg-brand" : "bg-slate-300"
              )}
              role="switch"
              aria-checked={theme === "dark"}
              onClick={toggleTheme}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
                  theme === "dark" ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
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
