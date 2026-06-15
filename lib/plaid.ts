import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

/**
 * Server-side Plaid client. Returns null when credentials are not configured so
 * callers can degrade gracefully (the Banking UI shows a "not configured" note
 * instead of erroring). Set PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV in .env.
 */
export function getPlaidClient(): PlaidApi | null {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) return null;

  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const config = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(config);
}

export const PLAID_CONFIGURED = Boolean(
  process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET,
);
