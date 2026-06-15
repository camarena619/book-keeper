# Nexus Ledger — AI-Powered Bookkeeping & Invoicing

Multi-tenant bookkeeping & invoicing platform for small-business LLCs
(QuickBooks/Xero-style). Built on Next.js 15 App Router + Supabase.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, RSC, Server Actions) |
| Database / Auth | Supabase (Postgres + Auth + RLS) |
| Styling | Tailwind CSS |
| Forms / Validation | React Hook Form + Zod |
| PDF | @react-pdf/renderer |
| Icons | lucide-react |

## Getting started

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env      # then fill in your Supabase values
#    NEXT_PUBLIC_*  -> safe for the browser (protected by RLS)
#    ENCRYPTION_KEY -> server-only; generate with: openssl rand -hex 32

# 3. Apply database migrations
npm run supabase:db:push

# 4. Run
npm run dev               # http://localhost:3000
```

## Project layout

```
app/
  (auth)/         login, signup
  (dashboard)/    protected app (layout = sidebar + org switcher + header)
    actions.ts    server actions (org create/switch, sign out)
components/
  auth/  layout/  ...
lib/
  supabase/       browser + server + middleware clients (@supabase/ssr)
  crypto.ts       server-only AES-256-GCM (bank details / Plaid tokens)
  org.ts          active-organization resolution
middleware.ts     auth route protection (/dashboard -> /login)
supabase/
  migrations/     schema, RLS, double-entry ledger, audit log
  functions/      edge functions (net30 overdue reminder)
legacy/           previous Vite SPA, kept for reference while porting
```

## Security notes

- Secrets never ship to the browser: only `NEXT_PUBLIC_`-prefixed vars are
  bundled client-side. Bank-detail encryption runs server-side in `lib/crypto.ts`
  (guarded by `import "server-only"`).
- All data access is constrained by Supabase Row Level Security; granular
  per-operation RBAC policies live in the migrations.
- Security headers (CSP, HSTS, X-Frame-Options, etc.) are set in `next.config.mjs`.

## Status

Foundation complete: auth, multi-org, route protection, dashboard overview.
Screens being ported from `legacy/`: contacts, invoices (+ PDF), expenses,
banking (Plaid), general ledger, settings. See the migration plan in chat.
