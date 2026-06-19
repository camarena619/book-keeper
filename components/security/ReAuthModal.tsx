"use client";

import { useState, useEffect, useCallback } from "react";
import { Portal } from "@/components/layout/Portal";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Lock, AlertTriangle } from "lucide-react";

// ==========================================
// RE-AUTHENTICATION MODAL
// ==========================================
// Step-up auth: requires password (and TOTP, if enrolled) re-entry before a
// sensitive operation such as changing bank/ACH details. Credentials are
// verified on a throwaway Supabase client (persistSession: false) so the main
// cookie-backed session is never disturbed and nothing is stored in the browser.

interface ReAuthModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Human-readable description of the sensitive action */
  actionDescription: string;
  /** Called with true on success, false on cancel */
  onResult: (authenticated: boolean) => void;
}

export function ReAuthModal({ isOpen, actionDescription, onResult }: ReAuthModalProps) {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMFA, setHasMFA] = useState(false);
  const [factorId, setFactorId] = useState("");

  // On open: reset fields and detect a verified TOTP factor.
  useEffect(() => {
    if (!isOpen) return;
    setPassword("");
    setTotpCode("");
    setError("");
    setHasMFA(false);
    setFactorId("");
    const supabase = createClient();
    supabase.auth.mfa
      .listFactors()
      .then(({ data }) => {
        const verified = data?.totp?.find((f) => f.status === "verified");
        if (verified) {
          setHasMFA(true);
          setFactorId(verified.id);
        }
      })
      .catch(() => {
        // If the MFA check fails, fall back to password-only verification.
      });
  }, [isOpen]);

  const handleCancel = useCallback(() => {
    setPassword("");
    setTotpCode("");
    setError("");
    onResult(false);
  }, [onResult]);

  // Escape closes the modal (treated as cancel).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, handleCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Password is required");
      return;
    }
    if (hasMFA && totpCode.length !== 6) {
      setError("Enter your 6-digit authenticator code");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("No active session");

      // Verify on a throwaway client so the live session/cookies stay intact.
      const temp = createPlainClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      );

      const { error: signInError } = await temp.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signInError) throw new Error("Incorrect password. Please try again.");

      if (hasMFA && factorId) {
        const { data: challenge, error: challengeError } =
          await temp.auth.mfa.challenge({ factorId });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await temp.auth.mfa.verify({
          factorId,
          challengeId: challenge.id,
          code: totpCode,
        });
        if (verifyError) throw new Error("Invalid authenticator code. Please try again.");
      }

      onResult(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setPassword("");
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-black/40 px-4 py-8"
        role="dialog"
        aria-modal="true"
        aria-label="Re-authentication required"
      >
        <div className="my-auto w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-elev backdrop-blur-xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
            <Lock className="h-6 w-6 text-brand" />
          </div>
          <h3 className="text-lg font-semibold">Confirm your identity</h3>
          <p className="mt-1 text-sm text-slate-500">This action requires verification:</p>
          <div className="mt-2 inline-block rounded-md bg-slate-200 px-3 py-1 text-sm font-medium text-slate-700">
            {actionDescription}
          </div>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 alert alert-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="reauth-password">
              Password
            </label>
            <input
              id="reauth-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoFocus
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {hasMFA && (
            <div>
              <label className="label" htmlFor="reauth-totp">
                Authenticator code
              </label>
              <input
                id="reauth-totp"
                className="input font-mono tracking-widest"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                autoComplete="one-time-code"
                disabled={loading}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Verifying…" : "Confirm"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          Your credentials are verified directly with the authentication server and are
          never stored locally.
        </p>
      </div>
    </div>
    </Portal>
  );
}

// ==========================================
// useReAuth — request step-up auth as a promise
// ==========================================
export function useReAuth() {
  const [showReAuth, setShowReAuth] = useState(false);
  const [actionDescription, setActionDescription] = useState("");
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const requestReAuth = useCallback(
    (description: string): Promise<boolean> =>
      new Promise((resolve) => {
        setActionDescription(description);
        setShowReAuth(true);
        setResolver(() => resolve);
      }),
    [],
  );

  const handleReAuthResult = useCallback((authenticated: boolean) => {
    setShowReAuth(false);
    setResolver((resolve: ((v: boolean) => void) | null) => {
      resolve?.(authenticated);
      return null;
    });
  }, []);

  return { showReAuth, actionDescription, requestReAuth, handleReAuthResult };
}
