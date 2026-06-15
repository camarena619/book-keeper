import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncTransactions } from "@/lib/plaid/sync";

/**
 * Plaid webhook handler endpoint.
 * Listens to TRANSACTION updates (e.g. SYNC_UPDATES_AVAILABLE) for a Plaid Item,
 * resolves the matching bank accounts from the database, and synchronizes transactions.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { webhook_type, webhook_code, item_id } = body;

  // 1. Filter for transaction updates
  if (webhook_type !== "TRANSACTIONS") {
    return NextResponse.json({ message: `Ignored webhook type: ${webhook_type}` }, { status: 200 });
  }

  // We handle cursor sync triggers (SYNC_UPDATES_AVAILABLE) and fallback updates
  const supportedCodes = ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE"];
  if (!supportedCodes.includes(webhook_code)) {
    return NextResponse.json({ message: `Ignored webhook code: ${webhook_code}` }, { status: 200 });
  }

  if (!item_id) {
    return NextResponse.json({ error: "Missing item_id in webhook payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase admin client uninitialized" }, { status: 500 });
  }

  try {
    // 2. Fetch all bank accounts registered to this Plaid Item
    const { data: accounts, error: queryErr } = await admin
      .from("bank_accounts")
      .select("id, name")
      .eq("plaid_item_id", item_id);

    if (queryErr) {
      return NextResponse.json({ error: `Failed to query accounts: ${queryErr.message}` }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: `No active bank accounts found for item_id: ${item_id}` }, { status: 200 });
    }

    // 3. Sync transactions for each account in parallel
    const syncPromises = accounts.map(async (acc) => {
      try {
        const result = await syncTransactions(acc.id);
        console.log(`Synced account ${acc.name} (${acc.id}): +${result.added} / ~${result.modified} / -${result.removed}`);
        return { account_id: acc.id, success: true, ...result };
      } catch (err) {
        console.error(`Failed to sync account ${acc.name} (${acc.id}):`, err);
        return { account_id: acc.id, success: false, error: err instanceof Error ? err.message : "Sync error" };
      }
    });

    const results = await Promise.all(syncPromises);

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
