"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function passwordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.max(1, score);
}

const STRENGTH_LABELS = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
const STRENGTH_COLORS = ["#dc2626", "#d97706", "#eab308", "#16a34a", "#0ea5e9"];

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // MFA challenge step (shown after password login when a TOTP factor exists)
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  const isSignup = mode === "signup";

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice(
          "Account created. Check your inbox to confirm your email, then sign in.",
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Step-up: if the user has a verified TOTP factor, require AAL2.
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel === "aal1") {
        setMfaRequired(true);
        return;
      }
      goToDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (mfaCode.length !== 6) return;
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
        code: mfaCode,
      });
      if (vErr) throw vErr;

      goToDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
      setMfaCode("");
    } finally {
      setLoading(false);
    }
  }

  async function cancelMfa() {
    // Don't leave the user in a half-authenticated AAL1 session.
    await supabase.auth.signOut();
    setMfaRequired(false);
    setMfaCode("");
    setPassword("");
    setError("");
  }

  // ---- MFA challenge screen ----
  if (mfaRequired) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-line bg-slate-100/90 p-8 shadow-elev backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold text-slate-900">Two-Factor Verification</div>
          <p className="mt-1 text-sm text-slate-500">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>
        {error && (
          <div className="mb-4 rounded-md bg-red-950/40 border border-red-800/60 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        <form onSubmit={handleMfaVerify} className="flex flex-col gap-4">
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="input text-center font-mono text-lg tracking-[0.4em]"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            autoComplete="one-time-code"
          />
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || mfaCode.length !== 6}
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-300"
            onClick={cancelMfa}
          >
            Cancel
          </button>
        </form>
      </div>
    );
  }

  // ---- Login / signup screen ----
  const strength = passwordStrength(password);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-slate-100/90 p-8 shadow-elev backdrop-blur-xl">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-brand-accent font-extrabold">Nexus</span>{" "}
          <span className="text-slate-500">Ledger</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {isSignup ? "Create your account" : "Sign in to your account"}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-950/40 border border-red-800/60 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-green-950/40 border border-green-800/60 px-3 py-2 text-sm text-green-200">
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {isSignup && password.length > 0 && (
            <div className="mt-2">
              <div className="flex h-1 gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      backgroundColor:
                        i <= strength ? STRENGTH_COLORS[strength - 1] : "#1f2635",
                    }}
                  />
                ))}
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: STRENGTH_COLORS[strength - 1] }}
              >
                {STRENGTH_LABELS[strength - 1]}
              </span>
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Please wait…" : isSignup ? "Sign Up" : "Sign In"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link href="/signup" className="font-medium text-brand">
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
