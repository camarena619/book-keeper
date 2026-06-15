"use client";

import { Landmark } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ConnectBankButton } from "./ConnectBankButton";

export interface BankAccount {
  id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  balance_cents: number;
  account_type: string | null;
  last_synced_at: string | null;
}

export function BankingView({
  accounts,
  plaidConfigured,
  isAal2,
  canManage,
}: {
  accounts: BankAccount[];
  plaidConfigured: boolean;
  isAal2: boolean;
  canManage: boolean;
}) {
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0);
  const canConnect = plaidConfigured && isAal2 && canManage;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Banking</h1>
          <p className="text-sm text-slate-500">Connected accounts &amp; balances</p>
        </div>
        {canManage && <ConnectBankButton disabled={!canConnect} />}
      </header>

      {!plaidConfigured && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Plaid isn&rsquo;t configured yet. Add <code>PLAID_CLIENT_ID</code> and{" "}
          <code>PLAID_SECRET</code> (sandbox) to <code>.env</code> to enable bank connections.
        </div>
      )}
      {plaidConfigured && !isAal2 && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Bank access requires two-factor authentication. Enable 2FA in Settings, then sign in
          again to manage bank connections.
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card text-center text-sm text-slate-400">
          No bank accounts linked yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <div key={a.id} className="card">
                <div className="mb-2 flex items-center gap-2 text-slate-500">
                  <Landmark className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-wide">
                    {a.account_type ?? "account"}
                  </span>
                </div>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-slate-400">
                  {a.official_name}
                  {a.mask ? ` ····${a.mask}` : ""}
                </div>
                <div className="mt-2 font-mono text-xl font-bold text-success">
                  {formatCurrency(a.balance_cents)}
                </div>
                {a.last_synced_at && (
                  <div className="mt-1 text-xs text-slate-400">
                    Synced {formatDate(a.last_synced_at)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-sm text-slate-500">
            Total cash:{" "}
            <span className="font-mono font-semibold text-slate-900">
              {formatCurrency(total)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
