import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook: on a completed checkout for an invoice payment link, mark the
 * matching invoice paid (which fires the ledger auto-post trigger). Uses a
 * service-role client because webhooks have no user session.
 */
export async function POST(req: Request) {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured." },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : ""}` },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const linkId =
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link?.id;
    const invoiceId = session.metadata?.invoice_id;

    const admin = createAdminClient();
    if (admin && (invoiceId || linkId)) {
      const query = admin.from("invoices").update({ status: "paid" });
      const { error } = invoiceId
        ? await query.eq("id", invoiceId)
        : await query.eq("stripe_payment_link_id", linkId!);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
