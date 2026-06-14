import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserOrgs, getActiveOrg } from "@/lib/org";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { CreateFirstOrg } from "@/components/layout/CreateFirstOrg";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5 text-xl font-bold">
          <span className="text-brand">Ledger</span>LLC
        </div>
        <OrgSwitcher orgs={orgs} activeId={activeOrg.id} />
        <div className="mt-4 flex-1">
          <SidebarNav />
        </div>
        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 px-3 text-xs text-slate-400">
            {user.email}
          </div>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
