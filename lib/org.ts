import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_ORG_COOKIE = "active_org_id";

export interface Org {
  id: string;
  name: string;
  billing_email: string | null;
  role: string;
}

/** All organizations the current user belongs to, with their role in each. */
export async function getUserOrgs(): Promise<Org[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, billing_email)")
    .order("created_at", { ascending: true });

  if (!data) return [];

  return data
    .filter((row) => row.organizations)
    .map((row) => {
      // organizations comes back as an object via the FK relationship
      const org = row.organizations as unknown as {
        id: string;
        name: string;
        billing_email: string | null;
      };
      return {
        id: org.id,
        name: org.name,
        billing_email: org.billing_email,
        role: row.role as string,
      };
    });
}

/**
 * Resolve the active organization: the one named in the active_org_id cookie if
 * the user is still a member, otherwise the first org they belong to.
 */
export async function getActiveOrg(orgs?: Org[]): Promise<Org | null> {
  const all = orgs ?? (await getUserOrgs());
  if (all.length === 0) return null;
  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  return all.find((o) => o.id === wanted) ?? all[0];
}
