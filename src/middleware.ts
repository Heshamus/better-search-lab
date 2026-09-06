import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Uses the edge-safe `authConfig` (no DB/bcrypt) — see auth.config.ts.
// With no wrapper middleware function passed to `auth(...)`, Auth.js falls
// back to its own default behavior: run `callbacks.authorized`, and when it
// returns false, 302-redirect to `pages.signIn` ("/login") with the original
// URL preserved as `?callbackUrl=`.
export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

// Run on every path except Next internals and static files (anything with a
// dot). Public paths are decided in auth.config.ts#isPublicPath, not here, so
// there is exactly one list — and no more substring matching that let a
// hypothetical /login-* route bypass the guard.
export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
