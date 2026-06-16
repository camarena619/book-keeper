import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { decrypt } from "@/lib/crypto";
import { EmployeesView, type Employee } from "@/components/payroll/EmployeesView";

function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}

interface Row {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  ssn_encrypted: string | null;
  pay_type: "salary" | "hourly";
  pay_rate_cents: number;
  pay_frequency: "weekly" | "biweekly" | "semimonthly" | "monthly";
  federal_withholding_bp: number;
  state_withholding_bp: number;
  filing_status: "single" | "married" | "head_of_household";
  hire_date: string | null;
  status: "active" | "inactive";
}

export default async function EmployeesPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const { data } = await supabase
    .from("employees")
    .select(
      "id, name, email, address, ssn_encrypted, pay_type, pay_rate_cents, pay_frequency, federal_withholding_bp, state_withholding_bp, filing_status, hire_date, status",
    )
    .eq("organization_id", activeOrg.id)
    .order("name", { ascending: true });

  const employees: Employee[] = ((data as Row[] | null) ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    address: e.address,
    ssn: safeDecrypt(e.ssn_encrypted),
    pay_type: e.pay_type,
    pay_rate: Number(e.pay_rate_cents) / 100,
    pay_frequency: e.pay_frequency,
    federal_withholding_pct: e.federal_withholding_bp / 100,
    state_withholding_pct: e.state_withholding_bp / 100,
    filing_status: e.filing_status,
    hire_date: e.hire_date,
    status: e.status,
  }));

  const canManage = activeOrg.role === "owner" || activeOrg.role === "admin";

  return <EmployeesView employees={employees} canManage={canManage} />;
}
