import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { db } from "@/db/client";
import { authenticate, clientIp } from "@/lib/auth/authenticate";
import { loadEnv } from "@/config/env";

/** Surfaces to the login form as `code: "rate_limited"`. */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Everything that matters lives in authenticate() (rate limit, constant
      // time, case-insensitive lookup, session version); this only maps its
      // outcome onto Auth.js's contract: a user, null, or a coded error.
      async authorize(credentials, req) {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        const ip = clientIp(req?.headers, loadEnv().TRUSTED_PROXY_HOPS);
        const outcome = await authenticate(db, { email, password, ip });
        if (!outcome.ok) {
          if (outcome.reason === "rate_limited") throw new RateLimitedError();
          return null;
        }
        return { id: outcome.user.id, email: outcome.user.email, sv: outcome.user.sv };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sv = user.sv;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.sv = typeof token.sv === "number" ? token.sv : undefined;
      return session;
    },
  },
});
