"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  ExpenseSchema,
  EXPENSE_CATEGORIES,
  type ExpenseInput,
  type ExpenseCategory,
} from "@/lib/schemas/expense";

export type ExpenseActionState = { ok?: boolean; error?: string };

function revalidate() {
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/ledger");
  revalidatePath("/dashboard");
}

export async function createExpense(
  input: ExpenseInput,
): Promise<ExpenseActionState> {
  const parsed = ExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };

  const supabase = await createClient();
  // status 'approved' -> sync_expense_ledger_entry trigger posts the journal entry.
  const { error } = await supabase.from("expenses").insert({
    organization_id: org.id,
    title: parsed.data.title.trim(),
    category: parsed.data.category,
    amount_cents: Math.round(parsed.data.amount * 100),
    expense_date: new Date(parsed.data.expense_date).toISOString(),
    status: "approved",
  });

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Approve a pending bank-imported expense, optionally re-categorizing it. */
export async function approveExpense(
  id: string,
  category: ExpenseCategory,
): Promise<ExpenseActionState> {
  if (!EXPENSE_CATEGORIES.includes(category)) {
    return { error: "Invalid category" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({ status: "approved", category })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
