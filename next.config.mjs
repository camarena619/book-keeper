/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy migrated from the old vercel.json.
// - script-src allows 'unsafe-eval' only in dev (React Fast Refresh needs it).
// - style-src keeps 'unsafe-inline' (Tailwind/inline styles + react-pdf).
// - connect-src is scoped to self + Supabase (REST + Realtime websockets).
//   The old client-side ipapi.co geo lookup is removed in favor of capturing
//   request IP server-side, so it is intentionally NOT allowlisted here.
const csp = [
  "default-src 'self'",
  // cdn.plaid.com hosts the Plaid Link script + iframe.
  `script-src 'self' 'unsafe-inline' https://cdn.plaid.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.plaid.com",
  "frame-src https://cdn.plaid.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]
  .join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  // ESLint flat-config wiring comes later; type-checking still runs on build.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Keep rendered pages in the client-side Router Cache so revisiting a tab
    // you've already opened is instant (no server round-trip). Dynamic pages
    // are reused for 30s; mutations call router.refresh() which busts the cache,
    // so created/edited data still shows immediately.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
