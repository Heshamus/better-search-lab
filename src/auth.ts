import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { sql } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Keep this thin: look up the user, verify the bcrypt hash, then
      // delegate the allowlist check to the pure, unit-tested `isAllowed`.
      // All three must pass or we return null (Auth.js's "auth failed").
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        // Case-insensitive lookup: `isAllowed` is deliberately
        // case-insensitive, but a plain `eq(users.email, email)` is not —
        // if a stored row's casing differs from what the user types, that
        // exact-match lookup fails and `authorize` rejects at the "no user"
        // gate before `isAllowed` is ever consulted, locking out an
        // allowlisted user. Normalize at the query layer instead of
        // assuming stored casing (we don't control how `users` rows get
        // seeded).
        const normalizedEmail = email.trim().toLowerCase();
        const [user] = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${normalizedEmail}`)
          .limit(1);
        if (!user) return null;

        const passwordValid = await compare(password, user.passwordHash);
        if (!passwordValid) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
});
