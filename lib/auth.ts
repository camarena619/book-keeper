import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * Current user from the session JWT via getClaims().
 *
 * Unlike getUser() — which makes a network round-trip to the Supabase Auth
 * server on every call — getClaims() verifies the JWT signature locally (no
 * network) once asymmetric signing keys are enabled, falling back to a network
 * check otherwise. The middleware still uses getUser() to refresh the session;
 * this helper is for fast in-render reads. Wrapped in cache() so the layout and
 * page share one call per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | { sub?: string; email?: string }
    | undefined;
  if (!claims?.sub) return null;
  return { id: String(claims.sub), email: claims.email ? String(claims.email) : null };
});
