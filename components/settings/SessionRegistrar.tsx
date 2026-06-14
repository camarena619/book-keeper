"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { generateFingerprint } from "@/lib/deviceFingerprint";

/**
 * Records/updates the current device in user_sessions so the Active Sessions UI
 * has data. Runs once on dashboard mount. Renders nothing.
 *
 * Note: unlike the legacy implementation, this does NOT call a third-party geo
 * service (ipapi.co) — that was CSP-blocked and a privacy concern. IP/geo can be
 * captured server-side later if desired.
 */
export function SessionRegistrar() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const fingerprint = await generateFingerprint();
        const { data: existing } = await supabase
          .from("user_sessions")
          .select("id")
          .eq("user_id", user.id)
          .eq("device_fingerprint", fingerprint)
          .is("revoked_at", null)
          .limit(1);

        if (existing && existing.length > 0) {
          await supabase
            .from("user_sessions")
            .update({ last_active_at: new Date().toISOString() })
            .eq("id", existing[0].id);
        } else {
          await supabase.from("user_sessions").insert({
            user_id: user.id,
            user_agent: navigator.userAgent,
            device_fingerprint: fingerprint,
            is_current: true,
            last_active_at: new Date().toISOString(),
          });
        }
      } catch {
        // Non-fatal: session tracking is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
