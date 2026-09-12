import type { NextAuthConfig } from "next-auth";
import { demoIframeCookies } from "@/lib/auth/demo-cookies";
import { isSingleUserMode } from "@/lib/auth/single-user";

// Edge-safe half of the Auth.js config (imported by middleware.ts — no DB, no
// bcrypt). Middleware only verifies the JWT signature and is a fast pre-filter:
// the authority is resolveSessionUser() (src/lib/auth/session.ts), which every
// page layout and API guard runs against the users table (spec §9.5).

/** Paths reachable without a session. API routes self-guard inside their handlers. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/setup" || pathname.startsWith("/api/");
}

export const authConfig = {
  // A self-hosted app sits behind its own reverse proxy and always trusts the
  // host that proxy forwards. Without this, Auth.js v5 refuses every request in
  // production with `UntrustedHost` and sign-in is impossible unless the
  // operator sets AUTH_TRUST_HOST=true — an env var the spec does not require.
  trustHost: true,
  // Set here (not in auth.ts) so the middleware's NextAuth(authConfig) and the
  // main handler use the SAME cookie config — otherwise each emits its own
  // csrf cookie and they disagree. In the embedded HTTPS demo this relaxes
  // SameSite so sign-in works inside the Hugging Face iframe; undefined for
  // every real install, which keeps the Auth.js SameSite=Lax default. Edge-safe:
  // demoIframeCookies only reads env and isDemoMode (already used in middleware).
  cookies: demoIframeCookies(),
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      // Single-user / no-auth mode: no login is required at all (edge-safe check).
      if (isSingleUserMode()) return true;
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return !!auth?.user;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
