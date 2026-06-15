export const metadata = { title: "Offline — Nexus Ledger" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="text-2xl font-bold">
        <span className="text-brand">Nexus</span> Ledger
      </div>
      <p className="mt-3 text-slate-600">You&rsquo;re offline.</p>
      <p className="mt-1 text-sm text-slate-400">
        Reconnect to the internet and reload to continue.
      </p>
    </div>
  );
}
