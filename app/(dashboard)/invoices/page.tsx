import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  InvoicesView,
  type InvoiceListItem,
  type ClientOption,
} from "@/components/invoices/InvoicesView";

interface ItemRow {
  invoice_id: string;
  title: string;
  description: string | null;
  total_cents: number;
  sort_order: number;
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const [{ data: ledger }, { data: clients }, { data: orgRow }] = await Promise.all([
    supabase
      .from("invoice_ledger")
      .select(
        "invoice_id, invoice_number, client_name, client_email, client_address, status, due_date, subtotal_cents, tax_cents, grand_total_cents",
      )
      .eq("organization_id", activeOrg.id)
      .order("due_date", { ascending: false }),
    supabase
      .from("clients")
      .select("id, name")
      .eq("organization_id", activeOrg.id)
      .order("name", { ascending: true }),
    supabase
      .from("organizations")
      .select("name, billing_email")
      .eq("id", activeOrg.id)
      .single(),
  ]);

  const ledgerRows = ledger ?? [];

  // Fetch line items for the listed invoices, grouped per invoice.
  const ids = ledgerRows.map((r) => r.invoice_id);
  const { data: itemsData } = ids.length
    ? await supabase
        .from("invoice_items")
        .select("invoice_id, title, description, total_cents, sort_order")
        .in("invoice_id", ids)
        .order("sort_order", { ascending: true })
    : { data: [] as ItemRow[] };

  const itemsByInvoice = new Map<string, ItemRow[]>();
  for (const it of (itemsData as ItemRow[] | null) ?? []) {
    const arr = itemsByInvoice.get(it.invoice_id) ?? [];
    arr.push(it);
    itemsByInvoice.set(it.invoice_id, arr);
  }

  const invoices: InvoiceListItem[] = ledgerRows.map((r) => ({
    ...r,
    items: (itemsByInvoice.get(r.invoice_id) ?? []).map((it) => ({
      title: it.title,
      description: it.description,
      total_cents: Number(it.total_cents),
    })),
  }));

  const clientOptions: ClientOption[] = clients ?? [];
  const role = activeOrg.role;
  const canEdit = ["owner", "admin", "editor"].includes(role);
  const nextNumber = `INV-${new Date().getFullYear()}-${1000 + ledgerRows.length}`;

  return (
    <InvoicesView
      invoices={invoices}
      clients={clientOptions}
      org={{ name: orgRow?.name ?? activeOrg.name, email: orgRow?.billing_email ?? null }}
      canEdit={canEdit}
      nextNumber={nextNumber}
    />
  );
}
