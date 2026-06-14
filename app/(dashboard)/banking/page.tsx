import { ComingSoon } from "@/components/layout/ComingSoon";

export default function BankingPage() {
  return (
    <ComingSoon
      title="Banking"
      note="Plaid Link, account balances, and transaction sync. Next: wire real Plaid Link + /api/plaid token exchange with server-side token encryption."
    />
  );
}
