"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { getStripeClient } from "@/lib/stripe";
import { InvoiceSchema, type InvoiceInput } from "@/lib/schemas/invoice";

export type InvoiceActionState = { ok?: boolean; error?: string };
export type PaymentLinkState = { ok?: boolean; error?: string; url?: string };

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

/**
 * Create (or reuse) a Stripe Payment Link for an invoice so the customer can
 * pay online. Stores the link id + url; the Stripe webhook later marks the
 * invoice paid by matching the link id.
 */
export async function createInvoicePaymentLink(
  invoiceId: string,
): Promise<PaymentLinkState> {
  const stripe = getStripeClient();
  if (!stripe) {
    return { error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env." };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };

  const supabase = await createClient();
  // Pull the computed total + existing link from the ledger view + table.
  const [{ data: row }, { data: inv }] = await Promise.all([
    supabase
      .from("invoice_ledger")
      .select("invoice_number, grand_total_cents")
      .eq("invoice_id", invoiceId)
      .single(),
    supabase
      .from("invoices")
      .select("stripe_payment_link_url")
      .eq("id", invoiceId)
      .single(),
  ]);

  if (inv?.stripe_payment_link_url) {
    return { ok: true, url: inv.stripe_payment_link_url };
  }
  if (!row || !row.grand_total_cents || row.grand_total_cents <= 0) {
    return { error: "Invoice has no payable total." };
  }

  try {
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: row.grand_total_cents,
      product_data: { name: `Invoice ${row.invoice_number}` },
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { invoice_id: invoiceId, org_id: org.id },
    });

    await supabase
      .from("invoices")
      .update({
        stripe_payment_link_id: link.id,
        stripe_payment_link_url: link.url,
      })
      .eq("id", invoiceId);

    revalidatePath("/dashboard/invoices");
    return { ok: true, url: link.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe error" };
  }
}
