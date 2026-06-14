import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { LedgerView, type LedgerAccount, type JournalEntryWithLines } from "@/components/ledger/LedgerView";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  is_system: boolean;
}
interface LineRow {
  id: string;
  journal_entry_id: string;
  account_id: string;
  entry_type: "debit" | "credit";
  amount_cents: number;
}
interface EntryRow {
  id: string;
  entry_date: string;
  description: string;
  reference_source: string | null;
}

/** Normal-balance convention: assets/expenses are debit-normal, the rest credit-normal. */
function accountBalance(type: AccountType, debits: number, credits: number): number {
  return type === "asset" || type === "expense" ? debits - credits : credits - debits;
}

export default async function LedgerPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  // 1. Accounts + journal entries for the org
  const [{ data: accountsData }, { data: entriesData }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, code, name, type, is_system")
      .eq("organization_id", activeOrg.id)
      .order("code", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("id, entry_date, description, reference_source")
      .eq("organization_id", activeOrg.id)
      .order("entry_date", { ascending: false }),
  ]);

  const accounts: AccountRow[] = accountsData ?? [];
  const entries: EntryRow[] = entriesData ?? [];

  // 2. Ledger lines for those entries (RLS resolves org via the parent entry)
  const entryIds = entries.map((e) => e.id);
  const { data: linesData } = entryIds.length
    ? await supabase
        .from("ledger_lines")
        .select("id, journal_entry_id, account_id, entry_type, amount_cents")
        .in("journal_entry_id", entryIds)
    : { data: [] as LineRow[] };
  const lines: LineRow[] = linesData ?? [];

  // 3. Per-account balances
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const debitByAcct = new Map<string, number>();
  const creditByAcct = new Map<string, number>();
  for (const l of lines) {
    const map = l.entry_type === "debit" ? debitByAcct : creditByAcct;
    map.set(l.account_id, (map.get(l.account_id) ?? 0) + Number(l.amount_cents));
  }

  const enrichedAccounts: LedgerAccount[] = accounts.map((a) => ({
    ...a,
    balance: accountBalance(
      a.type,
      debitByAcct.get(a.id) ?? 0,
      creditByAcct.get(a.id) ?? 0,
    ),
  }));

  // 4. Journal entries with denormalized lines (account code/name for display)
  const linesByEntry = new Map<string, LineRow[]>();
  for (const l of lines) {
    const arr = linesByEntry.get(l.journal_entry_id) ?? [];
    arr.push(l);
    linesByEntry.set(l.journal_entry_id, arr);
  }
  const journalEntries: JournalEntryWithLines[] = entries.map((e) => ({
    ...e,
    lines: (linesByEntry.get(e.id) ?? []).map((l) => ({
      id: l.id,
      entry_type: l.entry_type,
      amount_cents: Number(l.amount_cents),
      account_code: accountById.get(l.account_id)?.code ?? "",
      account_name: accountById.get(l.account_id)?.name ?? "Unknown account",
    })),
  }));

  const canAddAccount = activeOrg.role === "owner" || activeOrg.role === "admin";

  return (
    <LedgerView
      accounts={enrichedAccounts}
      journalEntries={journalEntries}
      canAddAccount={canAddAccount}
    />
  );
}
