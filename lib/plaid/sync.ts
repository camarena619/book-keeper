import "server-only";
import { getPlaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
}

/**
 * Synchronizes transactions from Plaid Sandbox/Live for a specific connected bank account.
 * Decrypts the access token, invokes Plaid's cursor-based sync API, and reconciles changes
 * into the database. Bypasses client RLS via the Supabase Service Role client.
 */
export async function syncTransactions(bankAccountId: string): Promise<SyncResult> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase admin client could not be initialized.");
  }

  // 1. Retrieve the bank account credentials
  const { data: account, error: acctErr } = await admin
    .from("bank_accounts")
    .select("plaid_access_token, plaid_sync_cursor")
    .eq("id", bankAccountId)
    .single();

  if (acctErr || !account) {
    throw new Error(`Failed to find bank account: ${acctErr?.message ?? "Not found"}`);
  }

  if (!account.plaid_access_token) {
    throw new Error("Bank account has no active Plaid access token.");
  }

  // 2. Decrypt the access token
  let accessToken: string;
  try {
    accessToken = decrypt(account.plaid_access_token);
  } catch (err) {
    throw new Error("Failed to decrypt Plaid access token.");
  }

  const plaid = getPlaidClient();
  if (!plaid) {
    throw new Error("Plaid is not configured.");
  }

  let cursor: string | undefined = account.plaid_sync_cursor || undefined;
  let hasMore = true;
  let added: any[] = [];
  let modified: any[] = [];
  let removed: any[] = [];

  // 3. Fetch all updates from Plaid incrementally
  try {
    while (hasMore) {
      const response = await plaid.transactionsSync({
        access_token: accessToken,
        cursor: cursor,
        count: 500,
      });

      const data = response.data;
      added = added.concat(data.added);
      modified = modified.concat(data.modified);
      removed = removed.concat(data.removed);
      cursor = data.next_cursor;
      hasMore = data.has_more;
    }
  } catch (err: any) {
    throw new Error(`Plaid transaction sync failed: ${err?.response?.data?.error_message ?? err.message}`);
  }

  // 4. Reconcile changes in Supabase
  // Process Added and Modified transactions (upsert)
  if (added.length > 0 || modified.length > 0) {
    const upsertRows = [...added, ...modified].map((t) => ({
      bank_account_id: bankAccountId,
      plaid_transaction_id: t.transaction_id,
      amount_cents: Math.round(t.amount * 100),
      transaction_date: t.date,
      merchant_name: t.merchant_name || t.name,
      pending: t.pending ?? false,
      plaid_category: t.personal_finance_category?.detailed || t.category?.join(", ") || null,
    }));

    const { error: upsertErr } = await admin
      .from("bank_transactions")
      .upsert(upsertRows, { onConflict: "plaid_transaction_id" });

    if (upsertErr) {
      throw new Error(`Failed to save synchronized bank transactions: ${upsertErr.message}`);
    }
  }

  // Process Deleted transactions
  if (removed.length > 0) {
    const removedIds = removed.map((t) => t.transaction_id);
    const { error: deleteErr } = await admin
      .from("bank_transactions")
      .delete()
      .in("plaid_transaction_id", removedIds);

    if (deleteErr) {
      throw new Error(`Failed to remove deleted bank transactions: ${deleteErr.message}`);
    }
  }

  // 5. Save the next cursor and update last synced timestamp
  const { error: updateAcctErr } = await admin
    .from("bank_accounts")
    .update({
      plaid_sync_cursor: cursor,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", bankAccountId);

  if (updateAcctErr) {
    throw new Error(`Failed to update sync state: ${updateAcctErr.message}`);
  }

  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
  };
}
