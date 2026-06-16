import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  RecurringInvoicesView,
  type RecurringListItem,
  type ClientOption,
} from "@/components/recurring/RecurringInvoicesView";

interface RecRow {
  id: string;
  client_id: string;
  frequency: string;
  tax_rate_basis_points: number;
  due_days: number;
  auto_send: boolean;
  status: string;
  next_run_date: string;
  last_run_date: string | null;
  end_date: string | null;
}
interface ItemRow {
  recurring_invoice_id: string;
  title: string;
  description: string | null;
  total_cents: number;
  sort_order: number;
}

export default async function RecurringPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const [{ data: recs }, { data: clients }] = await Promise.all([
    supabase
      .from("recurring_invoices")
      .select(
        "id, client_id, frequency, tax_rate_basis_points, due_days, auto_send, status, next_run_date, last_run_date, end_date",
      )
      .eq("organization_id", activeOrg.id)
      .order("next_run_date", { ascending: true }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", activeOrg.id)
      .order("name", { ascending: true }),
  ]);

  const recRows: RecRow[] = recs ?? [];
  const ids = recRows.map((r) => r.id);
  const { data: itemsData } = ids.length
    ? await supabase
        .from("recurring_invoice_items")
        .select("recurring_invoice_id, title, description, total_cents, sort_order")
        .in("recurring_invoice_id", ids)
        .order("sort_order", { ascending: true })
    : { data: [] as ItemRow[] };

  const itemsByRec = new Map<string, ItemRow[]>();
  for (const it of (itemsData as ItemRow[] | null) ?? []) {
    const arr = itemsByRec.get(it.recurring_invoice_id) ?? [];
    arr.push(it);
    itemsByRec.set(it.recurring_invoice_id, arr);
  }
  const clientName = new Map<string, string>((clients ?? []).map((c) => [c.id, c.name]));

  const recurring: RecurringListItem[] = recRows.map((r) => {
    const items = itemsByRec.get(r.id) ?? [];
    const subtotal = items.reduce((s, it) => s + Number(it.total_cents), 0);
    const total = subtotal + Math.round((subtotal * r.tax_rate_basis_points) / 10000);
    return {
      ...r,
      client_name: clientName.get(r.client_id) ?? "Unknown client",
      grand_total_cents: total,
      items: items.map((it) => ({
        title: it.title,
        description: it.description,
        amount: Number(it.total_cents) / 100,
      })),
    };
  });

  const clientOptions: ClientOption[] = clients ?? [];
  const role = activeOrg.role;
  const canEdit = ["owner", "admin", "editor"].includes(role);

  return (
    <RecurringInvoicesView
      recurring={recurring}
      clients={clientOptions}
      canEdit={canEdit}
    />
  );
}
