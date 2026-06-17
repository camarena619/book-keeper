"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Standalone two-factor challenge. Reached when a session is only AAL1 but the
 * user has a verified TOTP factor (middleware redirects here). Completing it
 * steps the session up to AAL2; cancelling signs out so no half-authenticated
 * session lingers.
 */
export function MfaChallenge() {
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setError("");
    setLoading(true);
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
      if (fErr) throw fErr;
      const totp = factors?.totp?.find((f) => f.status === "verified");
      if (!totp) throw new Error("No verified authenticator found.");

      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (cErr) throw cErr;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code,
      });
      if (vErr) throw vErr;

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-slate-100/90 p-8 shadow-elev backdrop-blur-xl">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand/15">
          <ShieldCheck className="h-6 w-6 text-brand" />
        </div>
        <div className="text-2xl font-bold text-slate-900">Two-Factor Verification</div>
        <p className="mt-1 text-sm text-slate-500">
          Your account requires two-factor authentication. Enter the 6-digit code
          from your authenticator app to continue.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-950/40 border border-red-800/60 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={verify} className="flex flex-col gap-4">
        <input
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          className="input text-center font-mono text-lg tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
          autoComplete="one-time-code"
        />
        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading || code.length !== 6}
        >
          {loading ? "Verifying…" : "Verify & continue"}
        </button>
        <button
          type="button"
          className="text-sm text-slate-500 hover:text-slate-300"
          onClick={cancel}
        >
          Cancel and sign out
        </button>
      </form>
    </div>
  );
}
