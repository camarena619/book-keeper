import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserOrgs, getActiveOrg } from "@/lib/org";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { CreateFirstOrg } from "@/components/layout/CreateFirstOrg";
import { SessionRegistrar } from "@/components/settings/SessionRegistrar";
import { SessionTimeout } from "@/components/security/SessionTimeout";
import { MobileTopBar } from "@/components/layout/MobileTopBar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Middleware already guards this, but re-check for type-safety + defense.
  if (!user) redirect("/login");

  const orgs = await getUserOrgs();
  const activeOrg = await getActiveOrg(orgs);

  // No organization yet → onboarding (the signup trigger normally provisions
  // one, but this covers backfill/edge cases).
  if (!activeOrg) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <CreateFirstOrg email={user.email ?? ""} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <SessionRegistrar />
      <SessionTimeout />

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden w-64 flex-col border-r border-line bg-white/70 backdrop-blur-xl md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-sm font-bold text-white shadow-sm">
            N
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Nexus <span className="font-medium text-slate-400">Ledger</span>
          </span>
        </div>
        <OrgSwitcher orgs={orgs} activeId={activeOrg.id} />
        <div className="mt-3 flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center gap-2 px-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold uppercase text-brand">
              {(user.email ?? "?").charAt(0)}
            </span>
            <span className="truncate text-xs text-slate-500">{user.email}</span>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Right column: mobile top bar (mobile only) + main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          orgs={orgs}
          activeId={activeOrg.id}
          userEmail={user.email ?? ""}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl animate-fade-in px-4 py-6 md:px-8 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
