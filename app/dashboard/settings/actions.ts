"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { encrypt } from "@/lib/crypto";
import { OrgSettingsSchema, type OrgSettingsInput } from "@/lib/schemas/org";

export type SettingsActionState = { ok?: boolean; error?: string };

export async function updateOrgSettings(
  input: OrgSettingsInput,
): Promise<SettingsActionState> {
  const parsed = OrgSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };
  if (org.role !== "owner") {
    return { error: "Only the organization owner can edit banking settings." };
  }

  const { name, billing_email, routing_number, account_number } = parsed.data;

  // Encrypt bank details SERVER-SIDE before they ever touch the database.
  // The key (ENCRYPTION_KEY) is server-only and never shipped to the browser.
  let encRouting: string | null = null;
  let encAccount: string | null = null;
  try {
    encRouting = routing_number ? encrypt(routing_number) : null;
    encAccount = account_number ? encrypt(account_number) : null;
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Encryption failed: ${err.message}`
          : "Encryption failed (is ENCRYPTION_KEY set?)",
    };
  }

  const supabase = await createClient();
  // RLS additionally restricts UPDATE to owners.
  const { error } = await supabase
    .from("organizations")
    .update({
      name: name.trim(),
      billing_email: billing_email?.trim() || null,
      routing_number: encRouting,
      account_number: encAccount,
    })
    .eq("id", org.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout"); // org switcher shows the name
  return { ok: true };
}
