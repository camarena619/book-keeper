import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, image optimization, and PWA
     * files (manifest, service worker, icons). Excluding these avoids a Supabase
     * auth round-trip on every asset request — notably the manifest, which the
     * browser re-fetches on navigations.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
