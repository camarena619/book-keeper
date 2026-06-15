"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { ContactSchema, type ContactInput } from "@/lib/schemas/contact";

export type ContactActionState = { ok?: boolean; error?: string };

function normalize(input: ContactInput) {
  return {
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
  };
}

export async function createContact(
  input: ContactInput,
): Promise<ContactActionState> {
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .insert({ organization_id: org.id, ...normalize(parsed.data) });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/contacts");
  return { ok: true };
}

export async function updateContact(
  id: string,
  input: ContactInput,
): Promise<ContactActionState> {
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createClient();
  // RLS ensures the row belongs to an org the user can edit.
  const { error } = await supabase
    .from("clients")
    .update(normalize(parsed.data))
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/contacts");
  return { ok: true };
}

export async function deleteContact(id: string): Promise<ContactActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/contacts");
  return { ok: true };
}
