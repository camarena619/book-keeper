"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/org";

/** Persist the selected organization and refresh the dashboard. */
export async function setActiveOrg(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/dashboard", "layout");
}

/** Create a new organization (RLS-safe via SECURITY DEFINER RPC) and select it. */
export async function createOrg(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { data: newOrgId, error } = await supabase.rpc("create_organization", {
    org_name: name,
    org_email: String(formData.get("email") ?? "") || null,
  });
  if (error) throw new Error(error.message);

  if (newOrgId) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, newOrgId as string, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

/** Sign the current user out and return to the login page. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
