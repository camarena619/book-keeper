import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { getPlaidClient } from "@/lib/plaid";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plaid = getPlaidClient();
  if (!plaid) {
    return NextResponse.json(
      { error: "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET to .env." },
      { status: 503 },
    );
  }

  try {
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "LedgerLLC",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Plaid error" },
      { status: 500 },
    );
  }
}
