"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { encrypt } from "@/lib/crypto";
import { EmployeeSchema, type EmployeeInput } from "@/lib/schemas/employee";

export type EmployeeActionState = { ok?: boolean; error?: string };

export async function saveEmployee(
  input: EmployeeInput,
): Promise<EmployeeActionState> {
  const parsed = EmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };
  if (org.role !== "owner" && org.role !== "admin") {
    return { error: "Only an owner or admin can manage payroll." };
  }
  const supabase = await createClient();
  const d = parsed.data;

  const row = {
    organization_id: org.id,
    name: d.name.trim(),
    email: d.email?.trim() || null,
    address: d.address?.trim() || null,
    ssn_encrypted: d.ssn?.trim() ? encrypt(d.ssn.trim()) : null,
    pay_type: d.pay_type,
    pay_rate_cents: Math.round(d.pay_rate * 100),
    pay_frequency: d.pay_frequency,
    federal_withholding_bp: Math.round(d.federal_withholding_pct * 100),
    state_withholding_bp: Math.round(d.state_withholding_pct * 100),
    filing_status: d.filing_status,
    hire_date: d.hire_date || null,
    status: d.status,
  };

  const { error } = d.employee_id
    ? await supabase.from("employees").update(row).eq("id", d.employee_id)
    : await supabase.from("employees").insert(row);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/payroll/employees");
  return { ok: true };
}

export async function deleteEmployee(id: string): Promise<EmployeeActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) {
    // ON DELETE RESTRICT from payroll_items: surface a friendly message.
    return {
      error:
        "Can't delete — this employee has payroll history. Set them to inactive instead.",
    };
  }
  revalidatePath("/dashboard/payroll/employees");
  return { ok: true };
}
