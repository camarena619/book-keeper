import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";
import { ContactsView, type Contact } from "@/components/contacts/ContactsView";

export default async function ContactsPage() {
  const supabase = await createClient();
  const activeOrg = await getActiveOrg();
  if (!activeOrg) return null;

  const { data } = await supabase
    .from("clients")
    .select("id, name, email, phone, address")
    .eq("organization_id", activeOrg.id)
    .order("name", { ascending: true });

  const contacts: Contact[] = data ?? [];
  const role = activeOrg.role;
  const canEdit = ["owner", "admin", "editor"].includes(role);
  const canDelete = ["owner", "admin"].includes(role);

  return (
    <ContactsView contacts={contacts} canEdit={canEdit} canDelete={canDelete} />
  );
}
