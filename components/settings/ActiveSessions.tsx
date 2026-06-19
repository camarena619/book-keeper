"use client";

import { useState, useEffect, useCallback } from "react";
import { Laptop, Smartphone, Tablet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getDeviceInfo, generateFingerprint } from "@/lib/deviceFingerprint";

interface Session {
  id: string;
  ip_address: string | null;
  user_agent: string;
  device_fingerprint: string;
  city: string | null;
  country: string | null;
  is_current: boolean;
  last_active_at: string;
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "mobile") return <Smartphone className="h-5 w-5 text-slate-500" />;
  if (type === "tablet") return <Tablet className="h-5 w-5 text-slate-500" />;
  return <Laptop className="h-5 w-5 text-slate-500" />;
}

export function ActiveSessions() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const fingerprint = await generateFingerprint();

      const { data, error } = await supabase
        .from("user_sessions")
        .select("*")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .order("last_active_at", { ascending: false });
      if (error) throw error;

      setSessions(
        (data ?? []).map((s) => ({
          ...s,
          is_current: s.device_fingerprint === fingerprint,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function revoke(id: string) {
    setBusy(id);
    try {
      const { error } = await supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setBusy(null);
    }
  }

  async function revokeAllOthers() {
    setBusy("all");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const currentIds = sessions.filter((s) => s.is_current).map((s) => s.id);
      let q = supabase
        .from("user_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("revoked_at", null);
      if (currentIds.length > 0) q = q.not("id", "in", `(${currentIds.join(",")})`);
      const { error } = await q;
      if (error) throw error;
      setSessions((prev) => prev.filter((s) => s.is_current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke sessions");
    } finally {
      setBusy(null);
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="card max-w-2xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm text-slate-500">Devices currently signed in to your account.</p>
        </div>
        {sessions.some((s) => !s.is_current) && (
          <button className="btn-secondary text-xs" onClick={revokeAllOthers} disabled={busy !== null}>
            {busy === "all" ? "Revoking…" : "Revoke all others"}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 alert alert-danger">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400">No active sessions recorded.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((s) => {
            const info = getDeviceInfo(s.user_agent);
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 rounded-md border p-3 ${
                  s.is_current ? "border-brand/40 bg-brand/5" : "border-slate-200"
                }`}
              >
                <DeviceIcon type={info.device} />
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {info.browser} on {info.os}
                    {s.is_current && (
                      <span className="ml-2 badge badge-success">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {s.ip_address ? `IP ${s.ip_address} · ` : ""}
                    {s.city ? `${s.city}${s.country ? `, ${s.country}` : ""} · ` : ""}
                    Last active {fmt(s.last_active_at)}
                  </div>
                </div>
                {!s.is_current && (
                  <button
                    className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                    onClick={() => revoke(s.id)}
                    disabled={busy !== null}
                  >
                    {busy === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
