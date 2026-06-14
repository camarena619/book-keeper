export function ComingSoon({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
      </header>
      <div className="card">
        <p className="text-sm text-slate-500">{note}</p>
        <p className="mt-2 text-xs text-slate-400">
          Being ported from the legacy app — see <code>legacy/App.tsx</code>.
        </p>
      </div>
    </div>
  );
}
