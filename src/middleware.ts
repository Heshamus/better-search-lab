import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { isDemoMode } from "@/lib/demo/mode";
import { isDemoAllowed, READ_ONLY_DEMO_MESSAGE } from "@/lib/demo/allowlist";

// Uses the edge-safe `authConfig` (no DB/bcrypt) — see auth.config.ts.
// Auth.js's `authorized` callback (src/auth.config.ts) pre-filters for a JWT on
// every non-public path; pages and routes revalidate the session themselves.
const { auth } = NextAuth(authConfig);

/** In demo mode every API write is refused here, before auth and before any handler runs (spec §13). */
export default function middleware(req: NextRequest, event: unknown) {
  if (isDemoMode() && !isDemoAllowed(req.method, req.nextUrl.pathname)) {
    return NextResponse.json({ error: READ_ONLY_DEMO_MESSAGE }, { status: 403 });
  }
  return (auth as unknown as (r: NextRequest, e: unknown) => unknown)(req, event);
}

// Run on every path except Next internals and static files (anything with a
// dot). Public paths are decided in auth.config.ts#isPublicPath, not here, so
// there is exactly one list — and no more substring matching that let a
// hypothetical /login-* route bypass the guard.
export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
