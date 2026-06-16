import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import {
  ReportsView,
  type ReportInvoice,
  type ReportExpense,
  type ReportPayrollRun,
} from "@/components/reports/ReportsView";

export default async function ReportsPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const [{ data: invoices }, { data: expenses }, { data: runs }] = await Promise.all([
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
    supabase
      .from("payroll_runs")
      .select("id, pay_date, status")
      .eq("organization_id", activeOrg.id)
      .eq("status", "posted"),
  ]);

  // Aggregate posted-run item totals per run.
  const runRows = runs ?? [];
  const runIds = runRows.map((r) => r.id);
  const { data: items } = runIds.length
    ? await supabase
        .from("payroll_items")
        .select(
          "payroll_run_id, gross_cents, federal_tax_cents, state_tax_cents, social_security_cents, medicare_cents, other_deductions_cents, net_cents, employer_ss_cents, employer_medicare_cents",
        )
        .in("payroll_run_id", runIds)
    : { data: [] as never[] };

  const agg = new Map<string, { gross: number; empTax: number; erTax: number; net: number }>();
  for (const it of items ?? []) {
    const a = agg.get(it.payroll_run_id) ?? { gross: 0, empTax: 0, erTax: 0, net: 0 };
    a.gross += Number(it.gross_cents);
    a.empTax +=
      Number(it.federal_tax_cents) +
      Number(it.state_tax_cents) +
      Number(it.social_security_cents) +
      Number(it.medicare_cents) +
      Number(it.other_deductions_cents);
    a.erTax += Number(it.employer_ss_cents) + Number(it.employer_medicare_cents);
    a.net += Number(it.net_cents);
    agg.set(it.payroll_run_id, a);
  }

  const payrollRuns: ReportPayrollRun[] = runRows.map((r) => {
    const a = agg.get(r.id) ?? { gross: 0, empTax: 0, erTax: 0, net: 0 };
    return {
      id: r.id,
      pay_date: r.pay_date,
      gross_cents: a.gross,
      employee_tax_cents: a.empTax,
      employer_tax_cents: a.erTax,
      net_cents: a.net,
    };
  });

  return (
    <ReportsView
      invoices={(invoices as ReportInvoice[]) ?? []}
      expenses={(expenses as ReportExpense[]) ?? []}
      payrollRuns={payrollRuns}
    />
  );
}
