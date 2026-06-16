import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  PayrollView,
  type PayRunListItem,
  type PayrollEmployee,
} from "@/components/payroll/PayrollView";

export default async function PayrollPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const year = new Date().getFullYear();

  const [{ data: runs }, { data: employees }] = await Promise.all([
    supabase
      .from("payroll_runs")
      .select("id, period_start, period_end, pay_date, status")
      .eq("organization_id", activeOrg.id)
      .order("pay_date", { ascending: false }),
    supabase
      .from("employees")
      .select(
        "id, name, pay_type, pay_rate_cents, pay_frequency, federal_withholding_bp, state_withholding_bp",
      )
      .eq("organization_id", activeOrg.id)
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);

  const runRows = runs ?? [];
  const runIds = runRows.map((r) => r.id);

  // Per-run totals, and per-employee YTD SS wages for the preview wage-base cap.
  const { data: items } = runIds.length
    ? await supabase
        .from("payroll_items")
        .select(
          "payroll_run_id, employee_id, gross_cents, net_cents, payroll_runs!inner(status, pay_date)",
        )
        .in("payroll_run_id", runIds)
    : { data: [] as never[] };

  const totalsByRun = new Map<string, { gross: number; net: number }>();
  const ytdByEmployee = new Map<string, number>();
  for (const it of items ?? []) {
    const t = totalsByRun.get(it.payroll_run_id) ?? { gross: 0, net: 0 };
    t.gross += Number(it.gross_cents);
    t.net += Number(it.net_cents);
    totalsByRun.set(it.payroll_run_id, t);

    const run = it.payroll_runs as unknown as { status: string; pay_date: string };
    if (
      run?.status === "posted" &&
      run.pay_date >= `${year}-01-01` &&
      run.pay_date < `${year + 1}-01-01`
    ) {
      ytdByEmployee.set(
        it.employee_id,
        (ytdByEmployee.get(it.employee_id) ?? 0) + Number(it.gross_cents),
      );
    }
  }

  const payRuns: PayRunListItem[] = runRows.map((r) => ({
    id: r.id,
    period_start: r.period_start,
    period_end: r.period_end,
    pay_date: r.pay_date,
    status: r.status,
    gross_cents: totalsByRun.get(r.id)?.gross ?? 0,
    net_cents: totalsByRun.get(r.id)?.net ?? 0,
  }));

  const payrollEmployees: PayrollEmployee[] = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    pay_type: e.pay_type,
    pay_rate_cents: Number(e.pay_rate_cents),
    pay_frequency: e.pay_frequency,
    federal_withholding_bp: e.federal_withholding_bp,
    state_withholding_bp: e.state_withholding_bp,
    ytd_ss_wages_cents: ytdByEmployee.get(e.id) ?? 0,
  }));

  const canManage = activeOrg.role === "owner" || activeOrg.role === "admin";

  return (
    <PayrollView
      payRuns={payRuns}
      employees={payrollEmployees}
      canManage={canManage}
    />
  );
}
