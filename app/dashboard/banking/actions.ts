"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { syncTransactions } from "@/lib/plaid/sync";

export interface SyncActionResponse {
  ok?: boolean;
  error?: string;
  result?: {
    added: number;
    modified: number;
    removed: number;
  };
}

/**
 * Server action to manually trigger Plaid transaction synchronization.
 * Checks that the user is authenticated and is a member of the organization
 * that owns the target bank account.
 */
export async function syncTransactionsAction(bankAccountId: string): Promise<SyncActionResponse> {
  // 1. Authenticate user
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized. Please sign in to sync." };
  }

  // 2. Resolve active organization and verify ownership of the bank account
  const org = await getActiveOrg();
  if (!org) {
    return { error: "No active organization context found." };
  }

  // Perform standard RLS check: verify bank account belongs to active organization
  const { data: account, error: queryErr } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("id", bankAccountId)
    .eq("organization_id", org.id)
    .single();

  if (queryErr || !account) {
    return { error: "Bank account access denied or account does not exist." };
  }

  // 3. Trigger server-side sync service
  try {
    const result = await syncTransactions(bankAccountId);
    revalidatePath("/dashboard/banking");
    return { ok: true, result };
  } catch (err: any) {
    console.error(`Error in syncTransactionsAction for account ${bankAccountId}:`, err);
    return { error: err.message || "Failed to sync bank transactions." };
  }
}
