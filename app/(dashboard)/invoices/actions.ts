"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { InvoiceSchema, type InvoiceInput } from "@/lib/schemas/invoice";

export type InvoiceActionState = { ok?: boolean; error?: string };

const ALLOWED_STATUS = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
type Status = (typeof ALLOWED_STATUS)[number];

export async function createInvoice(
  input: InvoiceInput,
): Promise<InvoiceActionState> {
  const parsed = InvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };

  const supabase = await createClient();

  // 1. Create the invoice (draft). The double-entry trigger only posts ledger
  //    entries once status moves to sent/paid.
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      organization_id: org.id,
      client_id: parsed.data.client_id,
      invoice_number: parsed.data.invoice_number,
      status: "draft",
      tax_rate_basis_points: parsed.data.tax_rate_basis_points,
      due_date: new Date(parsed.data.due_date).toISOString(),
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return { error: invErr?.message ?? "Failed to create invoice" };
  }

  // 2. Insert line items (amount dollars -> integer cents)
  const items = parsed.data.items.map((it, idx) => ({
    invoice_id: invoice.id,
    item_type: "flat_rate",
    title: it.title.trim(),
    description: it.description?.trim() || null,
    total_cents: Math.round(it.amount * 100),
    sort_order: idx,
  }));

  const { error: itemErr } = await supabase.from("invoice_items").insert(items);
  if (itemErr) {
    // Roll back the orphaned invoice header on item failure.
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return { error: itemErr.message };
  }

  revalidatePath("/dashboard/invoices");
  return { ok: true };
}

export async function updateInvoiceStatus(
  id: string,
  status: Status,
): Promise<InvoiceActionState> {
  if (!ALLOWED_STATUS.includes(status)) return { error: "Invalid status" };

  const supabase = await createClient();
  // RLS confines this to invoices in orgs the user can edit. The
  // sync_invoice_ledger_entry trigger posts/clears journal entries on change.
  const { error } = await supabase
    .from("invoices")
    .update({ status })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/ledger");
  revalidatePath("/dashboard");
  return { ok: true };
}
