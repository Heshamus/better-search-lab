import type { NextAuthConfig } from "next-auth";

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
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      return !!auth?.user;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
