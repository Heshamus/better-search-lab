import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Role } from "./users";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

/**
 * The authority on "who is this request": a signed JWT is necessary but not
 * sufficient. The user row must still exist and its session_version must equal
 * the token's `sv`, so deletion and password resets revoke immediately. Role is
 * read from the row every time (the token carries none), so a demotion applies
 * on the next request. One primary-key lookup per request.
 */
export async function resolveSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  const sv = session?.sv;
  if (!id || typeof sv !== "number") return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.sessionVersion !== sv) return null;
  return { id: row.id, email: row.email, role: row.role as Role };
}

/** For admin-only pages: redirects instead of returning a Response. */
export async function requireAdminUser(): Promise<SessionUser> {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  if (user.role !== "admin") redirect("/settings?error=admin_only");
  return user;
}
