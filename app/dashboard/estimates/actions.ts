"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { EstimateSchema, type EstimateInput } from "@/lib/schemas/estimate";

export type EstimateActionState = { ok?: boolean; error?: string; invoiceId?: string };

const ALLOWED_STATUS = ["draft", "sent", "accepted", "declined", "converted"] as const;
type Status = (typeof ALLOWED_STATUS)[number];

export async function createEstimate(
  input: EstimateInput,
): Promise<EstimateActionState> {
  const parsed = EstimateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };

  const supabase = await createClient();
  const { data: quote, error: qErr } = await supabase
    .from("quotes")
    .insert({
      organization_id: org.id,
      client_id: parsed.data.client_id,
      quote_number: parsed.data.quote_number,
      status: "draft",
      tax_rate_basis_points: parsed.data.tax_rate_basis_points,
      valid_until: parsed.data.valid_until
        ? new Date(parsed.data.valid_until).toISOString()
        : null,
    })
    .select("id")
    .single();

  if (qErr || !quote) return { error: qErr?.message ?? "Failed to create estimate" };

  const items = parsed.data.items.map((it, idx) => ({
    quote_id: quote.id,
    item_type: "flat_rate",
    title: it.title.trim(),
    description: it.description?.trim() || null,
    total_cents: Math.round(it.amount * 100),
    sort_order: idx,
  }));

  const { error: itemErr } = await supabase.from("quote_items").insert(items);
  if (itemErr) {
    await supabase.from("quotes").delete().eq("id", quote.id);
    return { error: itemErr.message };
  }

  revalidatePath("/dashboard/estimates");
  return { ok: true };
}

export async function updateEstimateStatus(
  id: string,
  status: Status,
): Promise<EstimateActionState> {
  if (!ALLOWED_STATUS.includes(status)) return { error: "Invalid status" };
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/estimates");
  return { ok: true };
}

/** Convert an accepted estimate to an invoice via the SECURITY DEFINER RPC. */
export async function convertEstimate(id: string): Promise<EstimateActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_quote_to_invoice", {
    target_quote_id: id,
    net_days: 30,
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/estimates");
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/ledger");
  revalidatePath("/dashboard");
  return { ok: true, invoiceId: data as string };
}
