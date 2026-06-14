"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "overview" | "enrolling" | "verifying" | "complete";

interface Factor {
  id: string;
  friendly_name: string;
  status: string;
  created_at: string;
}

export function MfaEnrollment({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("overview");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [aal, setAal] = useState("aal1");

  const loadStatus = useCallback(async () => {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) setAal(aalData.currentLevel || "aal1");
      const { data: factorData } = await supabase.auth.mfa.listFactors();
      if (factorData?.totp) {
        setFactors(
          factorData.totp.map((f) => ({
            id: f.id,
            friendly_name: f.friendly_name || "Authenticator",
            status: f.status,
            created_at: f.created_at,
          })),
        );
      }
    } catch (err) {
      console.error("Failed to load MFA status:", err);
    }
  }, [supabase]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleEnroll() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `LedgerLLC (${userEmail}) ${Date.now()}`,
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep("enrolling");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start enrollment");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (verifyCode.length !== 6) return setError("Enter a 6-digit code");
    setLoading(true);
    setError("");
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      });
      if (vErr) throw vErr;
      setStep("complete");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setVerifyCode("");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnenroll(id: string) {
    if (!confirm("Remove this authenticator? You'll need to re-enroll to use 2FA.")) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove authenticator");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card max-w-xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
        <p className="text-sm text-slate-500">
          Protect your account with an authenticator app (Google Authenticator, Authy, 1Password…).
        </p>
      </div>

      <span
        className={`mb-4 inline-block rounded-full px-2.5 py-1 text-xs font-medium ${
          aal === "aal2" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        {aal === "aal2" ? "● MFA active (AAL2)" : "○ MFA not configured"}
      </span>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {step === "overview" && (
        <div className="flex flex-col gap-4">
          {factors.length > 0 ? (
            <div className="flex flex-col gap-2">
              {factors.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 p-3"
                >
                  <div>
                    <div className="font-medium">{f.friendly_name}</div>
                    <div className="text-xs text-slate-400">
                      {f.status} · added {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-red-50"
                    onClick={() => handleUnenroll(f.id)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No authenticators configured yet.</p>
          )}
          <div>
            <button className="btn-primary" onClick={handleEnroll} disabled={loading}>
              {loading ? "Setting up…" : factors.length > 0 ? "+ Add authenticator" : "Enable 2FA"}
            </button>
          </div>
        </div>
      )}

      {step === "enrolling" && (
        <div className="flex flex-col items-start gap-3">
          <div className="text-xs font-medium text-slate-400">Step 1 of 2</div>
          <p className="text-sm">Scan this QR code with your authenticator app:</p>
          {qrCode && (
            <img src={qrCode} alt="MFA QR code" className="h-44 w-44 rounded-md border" />
          )}
          <div className="text-xs text-slate-500">
            Can&rsquo;t scan? Enter this secret manually:
            <code className="ml-1 rounded bg-slate-100 px-1 font-mono">{secret}</code>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => setStep("verifying")}>
              I&rsquo;ve scanned it →
            </button>
            <button className="btn-secondary" onClick={() => { setStep("overview"); setError(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === "verifying" && (
        <form onSubmit={handleVerify} className="flex flex-col items-start gap-3">
          <div className="text-xs font-medium text-slate-400">Step 2 of 2</div>
          <p className="text-sm">Enter the 6-digit code from your app:</p>
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="input w-40 text-center font-mono text-lg tracking-widest"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            autoComplete="one-time-code"
          />
          <div className="flex gap-2">
            <button className="btn-primary" type="submit" disabled={loading || verifyCode.length !== 6}>
              {loading ? "Verifying…" : "Verify & activate"}
            </button>
            <button className="btn-secondary" type="button" onClick={() => setStep("enrolling")}>
              ← Back
            </button>
          </div>
        </form>
      )}

      {step === "complete" && (
        <div className="flex flex-col items-start gap-3">
          <div className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
            ✓ Two-factor authentication enabled
          </div>
          <p className="text-sm text-slate-600">
            You&rsquo;ll be asked for a code from your authenticator app on future logins.
          </p>
          <button className="btn-primary" onClick={() => setStep("overview")}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
