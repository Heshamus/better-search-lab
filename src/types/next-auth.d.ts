import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** users.session_version at sign-in; a mismatch means the session was revoked. */
    sv?: number;
    user: { id: string } & DefaultSession["user"];
  }
  interface User {
    sv?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sv?: number;
  }
}
