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

  const isSignup = mode === "signup";

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
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  const strength = passwordStrength(password);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold">
          <span className="text-brand">Ledger</span>LLC
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {isSignup ? "Create your account" : "Sign in to your account"}
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
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
                        i <= strength ? STRENGTH_COLORS[strength - 1] : "#e2e8f0",
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
