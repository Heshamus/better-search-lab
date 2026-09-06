import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { db } from "@/db/client";
import { authenticate } from "@/lib/auth/authenticate";

/** Surfaces to the login form as `code: "rate_limited"`. */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

function clientIp(req: Request | undefined): string {
  const forwarded = req?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req?.headers?.get("x-real-ip") || "unknown";
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
        const outcome = await authenticate(db, { email, password, ip: clientIp(req) });
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
