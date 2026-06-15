"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";

export function ConnectBankButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setLoading(true);
      setError("");
      const res = await fetch("/api/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken }),
      });
      const json = await res.json();
      setLoading(false);
      setToken(null);
      if (!res.ok) {
        setError(json.error ?? "Failed to link account");
        return;
      }
      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({ token, onSuccess });

  // Open the Plaid Link modal once a link token is obtained and the SDK is ready.
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setError("");
    setLoading(true);
    const res = await fetch("/api/plaid/link-token", { method: "POST" });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Failed to start Plaid Link");
      return;
    }
    setToken(json.link_token);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-primary" onClick={start} disabled={disabled || loading}>
        {loading ? "Connecting…" : "🔗 Connect Bank Account"}
      </button>
      {error && <span className="max-w-xs text-right text-xs text-danger">{error}</span>}
    </div>
  );
}
