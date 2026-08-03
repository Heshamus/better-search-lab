import type { NextAuthConfig } from "next-auth";

// Edge-safe half of the Auth.js config. Imported by `middleware.ts`, which by
// default runs on the Edge runtime — so this file (and everything it
// transitively imports) MUST stay free of Node-only APIs. In particular:
// no `@/db/client` (the `postgres` driver needs Node TCP/TLS sockets) and no
// `bcryptjs` password verification. Those live only in `src/auth.ts`, which
// is loaded by Node.js-runtime code (Server Actions, Route Handlers) and is
// never imported here.
//
// Session reads in Middleware only need to verify the signed session JWT
// (via AUTH_SECRET) — they never re-run `authorize()` — so this minimal
// config (no providers, just `pages` + the `authorized` gate) is sufficient
// for the login guard.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
