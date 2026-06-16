"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { computePay } from "@/lib/payroll";
import { PayRunSchema, type PayRunInput } from "@/lib/schemas/payroll";

export type PayrollActionState = { ok?: boolean; error?: string };

function revalidate() {
  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/ledger");
  revalidatePath("/dashboard");
}

async function requireManager() {
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" as const };
  if (org.role !== "owner" && org.role !== "admin") {
    return { error: "Only an owner or admin can run payroll." as const };
  }
  return { org };
}

export async function createPayRun(
  input: PayRunInput,
): Promise<PayrollActionState> {
  const parsed = PayRunSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const guard = await requireManager();
  if ("error" in guard) return { error: guard.error };
  const { org } = guard;
  const supabase = await createClient();
  const d = parsed.data;

  const empIds = d.lines.map((l) => l.employee_id);
  const { data: emps } = await supabase
    .from("employees")
    .select(
      "id, pay_type, pay_rate_cents, pay_frequency, federal_withholding_bp, state_withholding_bp",
    )
    .eq("organization_id", org.id)
    .in("id", empIds);
  if (!emps || emps.length === 0) return { error: "No matching employees." };

  // YTD Social-Security wages this year (for the wage-base cap).
  const year = new Date(d.pay_date).getFullYear();
  const { data: ytdRows } = await supabase
    .from("payroll_items")
    .select("employee_id, gross_cents, payroll_runs!inner(organization_id, status, pay_date)")
    .eq("payroll_runs.organization_id", org.id)
    .eq("payroll_runs.status", "posted")
    .gte("payroll_runs.pay_date", `${year}-01-01`)
    .lt("payroll_runs.pay_date", `${year + 1}-01-01`)
    .in("employee_id", empIds);

  const ytd = new Map<string, number>();
  for (const r of ytdRows ?? []) {
    ytd.set(r.employee_id, (ytd.get(r.employee_id) ?? 0) + Number(r.gross_cents));
  }

  const empById = new Map(emps.map((e) => [e.id, e]));
  const hoursById = new Map(d.lines.map((l) => [l.employee_id, l.hours ?? 0]));

  // Create the draft run first.
  const { data: run, error: runErr } = await supabase
    .from("payroll_runs")
    .insert({
      organization_id: org.id,
      period_start: d.period_start,
      period_end: d.period_end,
      pay_date: d.pay_date,
      status: "draft",
    })
    .select("id")
    .single();
  if (runErr || !run) return { error: runErr?.message ?? "Failed to create run" };

  const items = d.lines.flatMap((line) => {
    const e = empById.get(line.employee_id);
    if (!e) return [];
    const c = computePay({
      pay_type: e.pay_type,
      pay_rate_cents: Number(e.pay_rate_cents),
      pay_frequency: e.pay_frequency,
      federal_withholding_bp: e.federal_withholding_bp,
      state_withholding_bp: e.state_withholding_bp,
      hours: hoursById.get(line.employee_id) ?? 0,
      ytd_ss_wages_cents: ytd.get(line.employee_id) ?? 0,
    });
    return [
      {
        payroll_run_id: run.id,
        employee_id: line.employee_id,
        hours: e.pay_type === "hourly" ? (hoursById.get(line.employee_id) ?? 0) : null,
        gross_cents: c.gross_cents,
        federal_tax_cents: c.federal_tax_cents,
        state_tax_cents: c.state_tax_cents,
        social_security_cents: c.social_security_cents,
        medicare_cents: c.medicare_cents,
        other_deductions_cents: c.other_deductions_cents,
        net_cents: c.net_cents,
        employer_ss_cents: c.employer_ss_cents,
        employer_medicare_cents: c.employer_medicare_cents,
      },
    ];
  });

  const { error: itemErr } = await supabase.from("payroll_items").insert(items);
  if (itemErr) {
    await supabase.from("payroll_runs").delete().eq("id", run.id);
    return { error: itemErr.message };
  }

  revalidate();
  return { ok: true };
}

export async function postPayRun(runId: string): Promise<PayrollActionState> {
  const guard = await requireManager();
  if ("error" in guard) return { error: guard.error };
  const { org } = guard;
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("id, status, pay_date")
    .eq("id", runId)
    .eq("organization_id", org.id)
    .single();
  if (!run) return { error: "Pay run not found." };
  if (run.status === "posted") return { error: "This run is already posted." };

  const { data: items } = await supabase
    .from("payroll_items")
    .select(
      "gross_cents, federal_tax_cents, state_tax_cents, social_security_cents, medicare_cents, other_deductions_cents, net_cents, employer_ss_cents, employer_medicare_cents",
    )
    .eq("payroll_run_id", runId);
  if (!items || items.length === 0) return { error: "Pay run has no employees." };

  const sum = (k: keyof (typeof items)[number]) =>
    items.reduce((s, it) => s + Number(it[k] ?? 0), 0);

  const gross = sum("gross_cents");
  const employerTax = sum("employer_ss_cents") + sum("employer_medicare_cents");
  const liabilities =
    sum("federal_tax_cents") +
    sum("state_tax_cents") +
    sum("social_security_cents") +
    sum("medicare_cents") +
    sum("other_deductions_cents") +
    sum("employer_ss_cents") +
    sum("employer_medicare_cents");
  const net = sum("net_cents");

  // Resolve the payroll accounts.
  const { data: accts } = await supabase
    .from("accounts")
    .select("id, code")
    .eq("organization_id", org.id)
    .in("code", ["6000", "6010", "2200", "1010"]);
  const acct = (code: string) => accts?.find((a) => a.code === code)?.id;
  const wages = acct("6000");
  const payrollTax = acct("6010");
  const payrollLiab = acct("2200");
  const checking = acct("1010");
  if (!wages || !payrollTax || !payrollLiab || !checking) {
    return { error: "Payroll chart-of-accounts is incomplete." };
  }

  const { data: je, error: jeErr } = await supabase
    .from("journal_entries")
    .insert({
      organization_id: org.id,
      entry_date: run.pay_date,
      description: `Payroll for pay date ${run.pay_date}`,
      reference_source: "payroll",
      reference_id: runId,
    })
    .select("id")
    .single();
  if (jeErr || !je) return { error: jeErr?.message ?? "Failed to post" };

  const lines = [
    { account_id: wages, entry_type: "debit" as const, amount_cents: gross },
    { account_id: payrollTax, entry_type: "debit" as const, amount_cents: employerTax },
    { account_id: payrollLiab, entry_type: "credit" as const, amount_cents: liabilities },
    { account_id: checking, entry_type: "credit" as const, amount_cents: net },
  ]
    .filter((l) => l.amount_cents > 0)
    .map((l) => ({ ...l, journal_entry_id: je.id }));

  const { error: lineErr } = await supabase.from("ledger_lines").insert(lines);
  if (lineErr) {
    await supabase.from("journal_entries").delete().eq("id", je.id);
    return { error: lineErr.message };
  }

  await supabase.from("payroll_runs").update({ status: "posted" }).eq("id", runId);
  revalidate();
  return { ok: true };
}

export async function deletePayRun(runId: string): Promise<PayrollActionState> {
  const guard = await requireManager();
  if ("error" in guard) return { error: guard.error };
  const { org } = guard;
  const supabase = await createClient();

  // Remove any posted journal entry first (cascades its ledger lines).
  await supabase
    .from("journal_entries")
    .delete()
    .eq("organization_id", org.id)
    .eq("reference_source", "payroll")
    .eq("reference_id", runId);

  const { error } = await supabase
    .from("payroll_runs")
    .delete()
    .eq("id", runId)
    .eq("organization_id", org.id);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}
