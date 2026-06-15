import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  EstimatesView,
  type EstimateListItem,
  type ClientOption,
} from "@/components/estimates/EstimatesView";

export default async function EstimatesPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const [{ data: ledger }, { data: clients }] = await Promise.all([
    supabase
      .from("quote_ledger")
      .select(
        "quote_id, quote_number, client_name, status, valid_until, created_at, subtotal_cents, tax_cents, grand_total_cents",
      )
      .eq("organization_id", activeOrg.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", activeOrg.id)
      .order("name", { ascending: true }),
  ]);

  const estimates: EstimateListItem[] = ledger ?? [];
  const clientOptions: ClientOption[] = clients ?? [];
  const canEdit = ["owner", "admin", "editor"].includes(activeOrg.role);
  const nextNumber = `EST-${new Date().getFullYear()}-${1000 + estimates.length}`;

  return (
    <EstimatesView
      estimates={estimates}
      clients={clientOptions}
      canEdit={canEdit}
      nextNumber={nextNumber}
    />
  );
}
