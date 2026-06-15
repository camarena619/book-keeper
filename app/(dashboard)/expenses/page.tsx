import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { AI_CONFIGURED } from "@/lib/ai";
import { ExpensesView, type Expense } from "@/components/expenses/ExpensesView";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const { data } = await supabase
    .from("expenses")
    .select("id, title, category, amount_cents, expense_date, status")
    .eq("organization_id", activeOrg.id)
    .order("expense_date", { ascending: false });

  const expenses: Expense[] = data ?? [];
  const pending = expenses.filter((e) => e.status === "pending_review");
  const approved = expenses.filter((e) => e.status === "approved");

  const canEdit = ["owner", "admin", "editor"].includes(activeOrg.role);

  return (
    <ExpensesView
      pending={pending}
      approved={approved}
      canEdit={canEdit}
      aiConfigured={AI_CONFIGURED}
    />
  );
}
