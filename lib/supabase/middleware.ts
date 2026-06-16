import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Refreshes the Supabase auth session on every request and enforces route
 * protection: unauthenticated users hitting /dashboard are redirected to
 * /login. Must run in middleware so Server Components see a fresh session.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-key";

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error("Supabase auth check failed in middleware:", err);
  }

  // Step-up enforcement: a user with a verified MFA factor whose session is
  // still AAL1 must complete the two-factor challenge before reaching the app.
  // "has a verified factor" comes from the fresh getUser() result; the current
  // level comes from the JWT's `aal` claim. Fail open on error so a transient
  // issue never locks anyone out (the login-time challenge + RLS still apply).
  let needsStepUp = false;
  if (user) {
    try {
      const hasVerifiedFactor = !!user.factors?.some(
        (f) => f.status === "verified",
      );
      if (hasVerifiedFactor) {
        const { data: aal } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        needsStepUp = aal?.currentLevel === "aal1";
      }
    } catch (err) {
      console.error("AAL check failed in middleware:", err);
    }
  }

  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/dashboard");
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isMfaRoute = pathname === "/mfa";

  const redirectTo = (path: string) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    return NextResponse.redirect(target);
  };

  // Unauthenticated users cannot reach protected pages or the challenge page.
  if (!user && (isProtected || isMfaRoute)) {
    return redirectTo("/login");
  }

  if (user) {
    // MFA enrolled but session is only AAL1 → force the challenge.
    if (needsStepUp && (isProtected || isAuthRoute)) {
      return redirectTo("/mfa");
    }
    // Fully authenticated (or no MFA) users have no business on the challenge
    // page or the login/signup screens.
    if (!needsStepUp && (isMfaRoute || isAuthRoute)) {
      return redirectTo("/dashboard");
    }
  }

  return supabaseResponse;
}
