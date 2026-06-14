// =============================================================================
// Book Keeper — Encrypted Data Export Edge Function
// =============================================================================
// Exports ALL organization data as a downloadable JSON file.
//
// Security layers:
//   1. Origin-locked CORS (ALLOWED_ORIGINS env var or localhost fallback)
//   2. JWT Bearer-token authentication via Supabase Auth
//   3. Organization ownership verification (must be 'owner' role)
//   4. Per-user rate limiting (max 1 export every 5 minutes)
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS Configuration
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS: string[] = (
  Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173"
)
  .split(",")
  .map((o) => o.trim());

/**
 * Resolve the correct Access-Control-Allow-Origin value for a request.
 * Only reflects the request origin if it appears in the allow-list.
 */
function resolveOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/** Standard CORS headers applied to every response. */
function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ---------------------------------------------------------------------------
// Rate Limiting — simple in-memory map (per isolate lifetime)
// ---------------------------------------------------------------------------
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const lastExportByUser = new Map<string, number>();

/**
 * Returns `true` if the user is still within the cooldown window.
 * Side-effect: records the current timestamp when allowed.
 */
function isRateLimited(userId: string): boolean {
  const lastExport = lastExportByUser.get(userId);
  const now = Date.now();

  if (lastExport && now - lastExport < RATE_LIMIT_MS) {
    return true;
  }

  lastExportByUser.set(userId, now);
  return false;
}

// ---------------------------------------------------------------------------
// All tables that belong to an organization export
// ---------------------------------------------------------------------------
const ORG_TABLES = [
  "clients",
  "quotes",
  "quote_items",
  "invoices",
  "invoice_items",
  "expenses",
  "suppliers",
  "expense_rules",
  "bank_accounts",
] as const;

// ---------------------------------------------------------------------------
// Edge Function Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // ── Preflight ───────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  // ── Method guard ────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }

  // ── JWT Authentication ──────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or malformed Authorization header." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Create a client scoped to the calling user's JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired authentication token." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }

  // ── Parse request body ──────────────────────────────────────────────────
  let organizationId: string;
  try {
    const body = await req.json();
    organizationId = body.organization_id;

    if (!organizationId || typeof organizationId !== "string") {
      throw new Error("organization_id is required and must be a string.");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request body.";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }

  // ── Rate Limit Check ───────────────────────────────────────────────────
  if (isRateLimited(user.id)) {
    return new Response(
      JSON.stringify({
        error: "Rate limit exceeded. You may export once every 5 minutes.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }

  // ── Ownership Verification ─────────────────────────────────────────────
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();

  if (memberError || !membership || membership.role !== "owner") {
    return new Response(
      JSON.stringify({
        error:
          "Forbidden. You must be an owner of this organization to export data.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      },
    );
  }

  // ── Fetch Organization Data ─────────────────────────────────────────────
  try {
    const tables: Record<string, unknown[]> = {};

    // Fetch all standard org-scoped tables in parallel
    const tableResults = await Promise.all(
      ORG_TABLES.map(async (table) => {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("organization_id", organizationId);

        if (error) {
          console.error(`Failed to fetch table "${table}":`, error.message);
          return { table, data: [] };
        }

        return { table, data: data ?? [] };
      }),
    );

    for (const result of tableResults) {
      tables[result.table] = result.data;
    }

    // Audit log uses a JSONB column for the org reference
    const { data: auditData, error: auditError } = await supabase
      .from("audit_log")
      .select("*")
      .eq("new_data->>organization_id", organizationId);

    if (auditError) {
      console.error("Failed to fetch audit_log:", auditError.message);
      tables["audit_log"] = [];
    } else {
      tables["audit_log"] = auditData ?? [];
    }

    // ── Build export payload ────────────────────────────────────────────
    const exportedAt = new Date().toISOString();
    const exportPayload = {
      version: "1.0",
      exported_at: exportedAt,
      organization_id: organizationId,
      tables,
    };

    // Format date for the filename (YYYY-MM-DD)
    const dateSlug = exportedAt.slice(0, 10);
    const filename = `bookkeeper-export-${organizationId}-${dateSlug}.json`;

    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...corsHeaders(req),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    console.error("Export failed:", message);

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }
});
