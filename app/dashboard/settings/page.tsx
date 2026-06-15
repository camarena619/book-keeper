import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { SettingsTabs } from "@/components/settings/SettingsTabs";

/**
 * Decrypt a stored bank field server-side. Returns "" if decryption fails —
 * e.g. legacy ciphertext encrypted with a different key/format. If the stored
 * value is plain digits (pre-encryption data), surface it as-is.
 */
function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return /^\d{4,17}$/.test(value) ? value : "";
  }
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const user = await getCurrentUser();

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name, billing_email, routing_number, account_number")
    .eq("id", activeOrg.id)
    .single();

  const initial = {
    name: orgRow?.name ?? activeOrg.name,
    billing_email: orgRow?.billing_email ?? "",
    routing_number: safeDecrypt(orgRow?.routing_number ?? null),
    account_number: safeDecrypt(orgRow?.account_number ?? null),
  };

  return (
    <SettingsTabs
      initial={initial}
      isOwner={activeOrg.role === "owner"}
      role={activeOrg.role}
      userEmail={user?.email ?? ""}
    />
  );
}
