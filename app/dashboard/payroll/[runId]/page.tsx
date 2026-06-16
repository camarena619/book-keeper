import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  PayRunDetailView,
  type PayStubAmounts,
  type PayRunItemRow,
} from "@/components/payroll/PayRunDetailView";

const ZERO: PayStubAmounts = {
  gross_cents: 0,
  federal_tax_cents: 0,
  state_tax_cents: 0,
  social_security_cents: 0,
  medicare_cents: 0,
  other_deductions_cents: 0,
  net_cents: 0,
};
const FIELDS = Object.keys(ZERO) as (keyof PayStubAmounts)[];

function addInto(acc: PayStubAmounts, row: Record<string, unknown>) {
  for (const f of FIELDS) acc[f] += Number(row[f] ?? 0);
}

export default async function PayRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, period_start, period_end, pay_date, status")
    .eq("id", runId)
    .eq("organization_id", activeOrg.id)
    .single();
  if (!run) notFound();

  const [{ data: items }, { data: org }] = await Promise.all([
    supabase
      .from("payroll_items")
      .select(
        "employee_id, hours, gross_cents, federal_tax_cents, state_tax_cents, social_security_cents, medicare_cents, other_deductions_cents, net_cents, employees(name, address)",
      )
      .eq("payroll_run_id", runId),
    supabase
      .from("organizations")
      .select("name, address")
      .eq("id", activeOrg.id)
      .single(),
  ]);

  const rows = items ?? [];
  const employeeIds = rows.map((r) => r.employee_id);
  const year = new Date(run.pay_date).getFullYear();

  // YTD per employee: this org's items in the same year, on/before this pay date,
  // counting posted runs plus this run.
  const ytdByEmployee = new Map<string, PayStubAmounts>();
  if (employeeIds.length) {
    const { data: ytdRows } = await supabase
      .from("payroll_items")
      .select(
        "employee_id, gross_cents, federal_tax_cents, state_tax_cents, social_security_cents, medicare_cents, other_deductions_cents, net_cents, payroll_runs!inner(id, organization_id, status, pay_date)",
      )
      .eq("payroll_runs.organization_id", activeOrg.id)
      .gte("payroll_runs.pay_date", `${year}-01-01`)
      .lte("payroll_runs.pay_date", run.pay_date)
      .in("employee_id", employeeIds);

    for (const r of ytdRows ?? []) {
      const pr = r.payroll_runs as unknown as { id: string; status: string };
      if (pr.status !== "posted" && pr.id !== runId) continue;
      const acc = ytdByEmployee.get(r.employee_id) ?? { ...ZERO };
      addInto(acc, r as Record<string, unknown>);
      ytdByEmployee.set(r.employee_id, acc);
    }
  }

  const detailRows: PayRunItemRow[] = rows.map((r) => {
    const emp = r.employees as unknown as { name: string; address: string | null } | null;
    return {
      employee_id: r.employee_id,
      employee_name: emp?.name ?? "Employee",
      employee_address: emp?.address ?? null,
      hours: r.hours == null ? null : Number(r.hours),
      current: {
        gross_cents: Number(r.gross_cents),
        federal_tax_cents: Number(r.federal_tax_cents),
        state_tax_cents: Number(r.state_tax_cents),
        social_security_cents: Number(r.social_security_cents),
        medicare_cents: Number(r.medicare_cents),
        other_deductions_cents: Number(r.other_deductions_cents),
        net_cents: Number(r.net_cents),
      },
      ytd: ytdByEmployee.get(r.employee_id) ?? { ...ZERO },
    };
  });

  return (
    <PayRunDetailView
      run={run}
      rows={detailRows}
      employer={{ name: org?.name ?? activeOrg.name, address: org?.address ?? null }}
    />
  );
}
