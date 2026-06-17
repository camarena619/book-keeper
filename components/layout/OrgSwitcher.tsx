"use client";

import { useTransition } from "react";
import { setActiveOrg } from "@/app/dashboard/actions";
import type { Org } from "@/lib/org";

export function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: Org[];
  activeId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-3 py-2">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
        Active Entity
      </label>
      <select
        className="w-full rounded-md border border-line bg-slate-100 text-slate-900 px-2 py-1.5 text-sm outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/15"
        value={activeId}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => {
            setActiveOrg(e.target.value);
          })
        }
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
