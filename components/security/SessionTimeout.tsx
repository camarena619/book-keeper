"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { signOut } from "@/app/dashboard/actions";
import { cn } from "@/lib/utils";

// ==========================================
// SESSION INACTIVITY TIMEOUT
// ==========================================
// Warns after 25 min of inactivity and forces sign-out at 30 min. Any user
// activity (mouse/keyboard/scroll/touch) resets the timer — except while the
// warning is showing, where the user must explicitly choose to stay.

const TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "touchstart", "click", "mousedown"];

export function SessionTimeout() {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [lastActivity, setLastActivity] = useState(() => Date.now());

  const extendSession = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
    setSecondsRemaining(0);
  }, []);

  const logout = useCallback(() => {
    setShowWarning(false);
    void signOut();
  }, []);

  // Reset the idle timer on activity (debounced to ~1s). Frozen while warning.
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onActivity = () => {
      if (showWarning || debounce) return;
      debounce = setTimeout(() => {
        setLastActivity(Date.now());
        debounce = null;
      }, 1000);
    };
    ACTIVITY_EVENTS.forEach((e) =>
      document.addEventListener(e, onActivity, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, onActivity));
      if (debounce) clearTimeout(debounce);
    };
  }, [showWarning]);

  // Tick every second: enter warning phase, then force logout.
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= TIMEOUT_MS) {
        clearInterval(interval);
        logout();
      } else if (elapsed >= WARNING_MS) {
        setSecondsRemaining(Math.ceil((TIMEOUT_MS - elapsed) / 1000));
        setShowWarning(true);
      } else if (showWarning) {
        setShowWarning(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastActivity, logout, showWarning]);

  if (!showWarning) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const critical = secondsRemaining <= 60;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs px-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Session expiring"
    >
      <div className="w-full max-w-sm rounded-xl border border-line bg-slate-900 p-6 text-center shadow-elev backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full",
            critical ? "bg-red-950/40" : "bg-amber-950/40",
          )}
        >
          <AlertTriangle
            className={cn("h-6 w-6", critical ? "text-danger" : "text-amber-500")}
          />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Session expiring soon</h3>
        <p className="mt-2 text-sm text-slate-500">
          You&apos;ve been inactive. For your security you&apos;ll be signed out
          automatically. Any unsaved changes may be lost.
        </p>
        <div className="my-4">
          <span
            className={cn(
              "text-3xl font-bold tabular-nums",
              critical ? "text-danger" : "text-slate-900",
            )}
          >
            {timeDisplay}
          </span>
          <span className="ml-2 text-sm text-slate-400">remaining</span>
        </div>
        <div className="flex flex-col gap-2">
          <button className="btn-primary w-full" onClick={extendSession} autoFocus>
            Stay signed in
          </button>
          <button className="btn-secondary w-full" onClick={logout}>
            Sign out now
          </button>
        </div>
      </div>
    </div>
  );
}
