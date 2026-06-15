import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { getPlaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/crypto";

export async function POST(req: Request) {
  const plaid = getPlaidClient();
  if (!plaid) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 503 });
  }

  let public_token: string | undefined;
  try {
    ({ public_token } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!public_token) {
    return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
  }

  const org = await getActiveOrg();
  if (!org) return NextResponse.json({ error: "No active organization" }, { status: 400 });

  const supabase = await createClient();
  try {
    // 1. Exchange the public token for a long-lived access token.
    const { data: exch } = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exch.access_token;
    const itemId = exch.item_id;

    // 2. Fetch the accounts on this item.
    const { data: acctData } = await plaid.accountsGet({ access_token: accessToken });

    // 3. Encrypt the access token SERVER-SIDE before persisting it.
    const encToken = encrypt(accessToken);

    const rows = acctData.accounts.map((a) => ({
      organization_id: org.id,
      plaid_item_id: itemId,
      plaid_account_id: a.account_id,
      name: a.name,
      mask: a.mask,
      official_name: a.official_name,
      balance_cents: Math.round((a.balances.current ?? 0) * 100),
      account_type: a.subtype ?? a.type,
      plaid_access_token: encToken,
      last_synced_at: new Date().toISOString(),
    }));

    // RLS requires owner role + AAL2 (the bank_accounts MFA policy).
    const { error } = await supabase.from("bank_accounts").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Plaid exchange failed" },
      { status: 500 },
    );
  }
}
