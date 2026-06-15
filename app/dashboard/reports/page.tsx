import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  ReportsView,
  type ReportInvoice,
  type ReportExpense,
} from "@/components/reports/ReportsView";

export default async function ReportsPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const [{ data: invoices }, { data: expenses }] = await Promise.all([
    supabase
      .from("invoice_ledger")
      .select(
        "invoice_id, invoice_number, client_name, status, due_date, created_at, grand_total_cents",
      )
      .eq("organization_id", activeOrg.id),
    supabase
      .from("expenses")
      .select("id, title, category, amount_cents, expense_date")
      .eq("organization_id", activeOrg.id),
  ]);

  return (
    <ReportsView
      invoices={(invoices as ReportInvoice[]) ?? []}
      expenses={(expenses as ReportExpense[]) ?? []}
    />
  );
}
