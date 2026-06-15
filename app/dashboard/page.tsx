import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { formatCurrency, formatDate } from "@/lib/utils";

interface InvoiceRow {
  invoice_id: string;
  invoice_number: string;
  client_name: string | null;
  status: string;
  due_date: string;
  grand_total_cents: number;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const [{ data: invoices }, { data: expenses }] = await Promise.all([
    supabase
      .from("invoice_ledger")
      .select("invoice_id, invoice_number, client_name, status, due_date, grand_total_cents")
      .eq("organization_id", activeOrg.id)
      .order("due_date", { ascending: false }),
    supabase
      .from("expenses")
      .select("amount_cents")
      .eq("organization_id", activeOrg.id),
  ]);

  const invoiceRows: InvoiceRow[] = invoices ?? [];
  const totalSales = invoiceRows
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + i.grand_total_cents, 0);
  const outstanding = invoiceRows
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.grand_total_cents, 0);
  const totalExpenses = (expenses ?? []).reduce(
    (s, e) => s + (e.amount_cents ?? 0),
    0,
  );
  const netProfit = totalSales - totalExpenses;

  const metrics = [
    { label: "Total Sales (Collected)", value: totalSales, color: "text-success" },
    { label: "Outstanding Receivables", value: outstanding, color: "text-warning" },
    { label: "Total Expenses", value: totalExpenses, color: "text-danger" },
    { label: "Net Profit", value: netProfit, color: "text-brand" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {activeOrg.name} · your role: {activeOrg.role}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card">
            <div className="text-sm text-slate-500">{m.label}</div>
            <div className={`mt-1 text-2xl font-bold ${m.color}`}>
              {formatCurrency(m.value)}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="mb-4 text-lg font-semibold">Recent Invoices</h2>
        {invoiceRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No invoices yet for this organization.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">Invoice #</th>
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium">Due</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.slice(0, 10).map((inv) => (
                  <tr key={inv.invoice_id} className="border-b border-slate-100">
                    <td className="py-2 font-mono">{inv.invoice_number}</td>
                    <td className="py-2">{inv.client_name}</td>
                    <td className="py-2">{formatDate(inv.due_date)}</td>
                    <td className="py-2 text-right font-mono">
                      {formatCurrency(inv.grand_total_cents)}
                    </td>
                    <td className="py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
