// Shown instantly (via Suspense) while a dashboard page's server component loads,
// so tab switches feel immediate instead of frozen.
export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      <div className="h-8 w-48 rounded bg-slate-200" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="h-4 w-24 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-28 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 h-5 w-40 rounded bg-slate-200" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-3 h-4 w-full rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
