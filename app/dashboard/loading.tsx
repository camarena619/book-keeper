// Shown instantly (via Suspense) while a dashboard page's server component loads,
// so tab switches feel immediate instead of frozen. Mirrors the real card styling.
export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="h-8 w-56 rounded-lg bg-slate-200/80" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="h-3.5 w-24 rounded bg-slate-200/80" />
            <div className="mt-3 h-7 w-28 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="mb-5 h-5 w-40 rounded bg-slate-200/80" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-3 h-4 w-full rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
