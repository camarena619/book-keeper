"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { OrgSwitcher } from "./OrgSwitcher";
import { SidebarNav } from "./SidebarNav";
import { SignOutButton } from "./SignOutButton";
import type { Org } from "@/lib/org";

/**
 * Mobile-only top bar + slide-in drawer. Hidden on md+ (desktop uses the fixed
 * sidebar). Reuses OrgSwitcher / SidebarNav / SignOutButton inside the drawer.
 */
export function MobileTopBar({
  orgs,
  activeId,
  userEmail,
}: {
  orgs: Org[];
  activeId: string;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (i.e. a nav link was tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface backdrop-blur-md px-4 py-3 md:hidden">
        <div className="text-lg font-bold tracking-tight text-slate-900">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-brand-accent">Nexus</span>{" "}
          <span className="font-medium text-slate-500">Ledger</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-surface border-r border-line shadow-elev backdrop-blur-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="text-xl font-bold tracking-tight text-slate-900">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand to-brand-accent">Nexus</span>{" "}
                <span className="font-medium text-slate-500">Ledger</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <OrgSwitcher orgs={orgs} activeId={activeId} />
            <div className="mt-4 flex-1 overflow-y-auto">
              <SidebarNav />
            </div>
            <div className="border-t border-line p-3">
              <div className="mb-2 px-3 text-xs text-slate-400">{userEmail}</div>
              <SignOutButton />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
