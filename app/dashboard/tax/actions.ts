"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { encrypt } from "@/lib/crypto";
import {
  ContractorSchema,
  PayerInfoSchema,
  type ContractorInput,
  type PayerInfoInput,
} from "@/lib/schemas/contractor";

export type TaxActionState = { ok?: boolean; error?: string };

export async function saveContractor(
  input: ContractorInput,
): Promise<TaxActionState> {
  const parsed = ContractorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };
  const supabase = await createClient();
  const d = parsed.data;

  const row = {
    organization_id: org.id,
    name: d.name.trim(),
    legal_name: d.legal_name?.trim() || null,
    contact_email: d.email?.trim() || null,
    address: d.address?.trim() || null,
    tax_id_encrypted: d.tax_id?.trim() ? encrypt(d.tax_id.trim()) : null,
    is_1099: true,
  };

  const { error } = d.supplier_id
    ? await supabase.from("suppliers").update(row).eq("id", d.supplier_id)
    : await supabase.from("suppliers").insert(row);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/tax");
  return { ok: true };
}

export async function unmarkContractor(supplierId: string): Promise<TaxActionState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_1099: false })
    .eq("id", supplierId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/tax");
  return { ok: true };
}

export async function savePayerInfo(
  input: PayerInfoInput,
): Promise<TaxActionState> {
  const parsed = PayerInfoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const org = await getActiveOrg();
  if (!org) return { error: "No active organization" };
  if (org.role !== "owner" && org.role !== "admin") {
    return { error: "Only an owner or admin can edit payer tax info." };
  }
  const supabase = await createClient();
  const d = parsed.data;

  const { error } = await supabase
    .from("organizations")
    .update({
      ein_encrypted: d.ein?.trim() ? encrypt(d.ein.trim()) : null,
      address: d.address?.trim() || null,
    })
    .eq("id", org.id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard/tax");
  return { ok: true };
}
