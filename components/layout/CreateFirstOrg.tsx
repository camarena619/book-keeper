import { createOrg } from "@/app/(dashboard)/actions";

export function CreateFirstOrg({ email }: { email: string }) {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <div className="text-2xl font-bold">
          <span className="text-brand">Ledger</span>LLC
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Let&rsquo;s set up your first business
        </p>
      </div>
      <form action={createOrg} className="card flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="name">
            Business name
          </label>
          <input
            id="name"
            name="name"
            className="input"
            placeholder="Acme LLC"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Billing email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            defaultValue={email}
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Create organization
        </button>
      </form>
    </div>
  );
}
