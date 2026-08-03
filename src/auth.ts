import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { loadEnv } from "@/config/env";
import { isAllowed } from "@/lib/auth/allowlist";

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

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!user) return null;

        const passwordValid = await compare(password, user.passwordHash);
        if (!passwordValid) return null;

        if (!isAllowed(email, loadEnv().ALLOWLIST)) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
});
