"use server";

import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  RecurringInvoiceSchema,
  type RecurringInvoiceInput,
} from "@/lib/schemas/recurring";

export type RecurringActionState = { ok?: boolean; error?: string; created?: number };

function itemsToRows(recurringId: string, items: RecurringInvoiceInput["items"]) {
  return items.map((it, idx) => ({
    recurring_invoice_id: recurringId,
    title: it.title.trim(),
    description: it.description?.trim() || null,
    total_cents: Math.round(it.amount * 100),
    sort_order: idx,
  }));
}

export async function createRecurringInvoice(
  input: RecurringInvoiceInput,
): Promise<RecurringActionState> {
  const parsed = RecurringInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };
  const supabase = await createClient();
  const d = parsed.data;

  const { data: rec, error: recErr } = await supabase
    .from("recurring_invoices")
    .insert({
      organization_id: org.id,
      client_id: d.client_id,
      frequency: d.frequency,
      tax_rate_basis_points: d.tax_rate_basis_points,
      due_days: d.due_days,
      auto_send: d.auto_send,
      status: "active",
      next_run_date: d.next_run_date,
      end_date: d.end_date || null,
    })
    .select("id")
    .single();

  if (recErr || !rec) return { error: recErr?.message ?? "Failed to create" };

  const { error: itemErr } = await supabase
    .from("recurring_invoice_items")
    .insert(itemsToRows(rec.id, d.items));
  if (itemErr) {
    await supabase.from("recurring_invoices").delete().eq("id", rec.id);
    return { error: itemErr.message };
  }
  return { ok: true };
}

export async function updateRecurringInvoice(
  id: string,
  input: RecurringInvoiceInput,
): Promise<RecurringActionState> {
  const parsed = RecurringInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createClient();
  const d = parsed.data;

  const { error: updErr } = await supabase
    .from("recurring_invoices")
    .update({
      client_id: d.client_id,
      frequency: d.frequency,
      tax_rate_basis_points: d.tax_rate_basis_points,
      due_days: d.due_days,
      auto_send: d.auto_send,
      next_run_date: d.next_run_date,
      end_date: d.end_date || null,
    })
    .eq("id", id);
  if (updErr) return { error: updErr.message };

  // Replace line items wholesale.
  await supabase.from("recurring_invoice_items").delete().eq("recurring_invoice_id", id);
  const { error: itemErr } = await supabase
    .from("recurring_invoice_items")
    .insert(itemsToRows(id, d.items));
  if (itemErr) return { error: itemErr.message };

  return { ok: true };
}

export async function setRecurringStatus(
  id: string,
  status: "active" | "paused",
): Promise<RecurringActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_invoices")
    .update({ status })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function deleteRecurringInvoice(
  id: string,
): Promise<RecurringActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_invoices").delete().eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Manually run the generator for the active org (same function the daily cron
 * calls). Useful to materialize anything already due without waiting.
 */
export async function generateNow(): Promise<RecurringActionState> {
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_due_recurring_invoices", {
    _org_id: org.id,
  });
  if (error) return { error: error.message };
  return { ok: true, created: typeof data === "number" ? data : 0 };
}
