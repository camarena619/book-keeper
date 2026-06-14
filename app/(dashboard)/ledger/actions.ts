"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";

const AccountSchema = z.object({
  code: z.string().regex(/^\d{4}$/, "Code must be 4 digits"),
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
});

export type CreateAccountState = { error?: string; ok?: boolean };

export async function createAccount(
  _prev: CreateAccountState,
  formData: FormData,
): Promise<CreateAccountState> {
  const parsed = AccountSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    type: formData.get("type"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const activeOrg = await getActiveOrg();
  if (!activeOrg) return { error: "No active organization" };

  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert({
    organization_id: activeOrg.id,
    code: parsed.data.code,
    name: parsed.data.name,
    type: parsed.data.type,
    is_system: false,
  });

  if (error) {
    // RLS rejection or unique-violation (duplicate code) surface here.
    return { error: error.message };
  }

  revalidatePath("/dashboard/ledger");
  return { ok: true };
}
