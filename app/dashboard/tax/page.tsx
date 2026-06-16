import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { decrypt } from "@/lib/crypto";
import {
  TaxFormsView,
  type Contractor,
  type PayerInfo,
} from "@/components/tax/TaxFormsView";

/** Decrypt a stored secret, tolerating legacy/plain values. */
function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return "";
  }
}

interface SupplierRow {
  id: string;
  name: string;
  legal_name: string | null;
  contact_email: string | null;
  address: string | null;
  tax_id_encrypted: string | null;
}

export default async function TaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const { year: yearParam } = await searchParams;
  const currentYear = new Date().getFullYear();
  const year = Number(yearParam) || currentYear;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;

  const [{ data: orgRow }, { data: suppliers }, { data: expenseRows }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("name, address, ein_encrypted")
        .eq("id", activeOrg.id)
        .single(),
      supabase
        .from("suppliers")
        .select("id, name, legal_name, contact_email, address, tax_id_encrypted")
        .eq("organization_id", activeOrg.id)
        .eq("is_1099", true)
        .order("name", { ascending: true }),
      // Approved expenses in the tax year that are tied to a contractor.
      supabase
        .from("expenses")
        .select("supplier_id, amount_cents")
        .eq("organization_id", activeOrg.id)
        .eq("status", "approved")
        .not("supplier_id", "is", null)
        .gte("expense_date", yearStart)
        .lt("expense_date", yearEnd),
    ]);

  const paidBySupplier = new Map<string, number>();
  for (const e of expenseRows ?? []) {
    if (!e.supplier_id) continue;
    paidBySupplier.set(
      e.supplier_id,
      (paidBySupplier.get(e.supplier_id) ?? 0) + Number(e.amount_cents),
    );
  }

  const contractors: Contractor[] = ((suppliers as SupplierRow[] | null) ?? []).map(
    (s) => ({
      supplier_id: s.id,
      name: s.name,
      legal_name: s.legal_name,
      email: s.contact_email,
      address: s.address,
      tax_id: safeDecrypt(s.tax_id_encrypted),
      total_paid_cents: paidBySupplier.get(s.id) ?? 0,
    }),
  );

  const payer: PayerInfo = {
    legal_name: orgRow?.name ?? activeOrg.name,
    address: orgRow?.address ?? "",
    ein: safeDecrypt(orgRow?.ein_encrypted ?? null),
  };

  const canManage = ["owner", "admin", "editor"].includes(activeOrg.role);

  return (
    <TaxFormsView
      contractors={contractors}
      payer={payer}
      year={year}
      currentYear={currentYear}
      canManage={canManage}
    />
  );
}
