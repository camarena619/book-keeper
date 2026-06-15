import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { PLAID_CONFIGURED } from "@/lib/plaid";
import { BankingView, type BankAccount } from "@/components/banking/BankingView";

export default async function BankingPage() {
  const supabase = await createClient();
  const org = await getActiveOrg();
  if (!org) return null;

  // bank_accounts is gated by a RESTRICTIVE AAL2 policy — surface that to the user.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const isAal2 = aal?.currentLevel === "aal2";

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, name, official_name, mask, balance_cents, account_type, last_synced_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });

  return (
    <BankingView
      accounts={(accounts as BankAccount[]) ?? []}
      plaidConfigured={PLAID_CONFIGURED}
      isAal2={isAal2}
      canManage={org.role === "owner"}
    />
  );
}
