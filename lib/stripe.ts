import "server-only";
import Stripe from "stripe";

/**
 * Server-side Stripe client. Returns null when STRIPE_SECRET_KEY is absent so
 * callers can degrade gracefully (the invoice UI shows a "not configured" note).
 */
export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export const STRIPE_CONFIGURED = Boolean(process.env.STRIPE_SECRET_KEY);
