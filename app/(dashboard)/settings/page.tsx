import { ComingSoon } from "@/components/layout/ComingSoon";

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      note="Organization details, ACH info (server-side encrypted), team & roles, MFA, sessions, and audit log. Next: port settings with bank numbers encrypted via lib/crypto.ts on the server."
    />
  );
}
