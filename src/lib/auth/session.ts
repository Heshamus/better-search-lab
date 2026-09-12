import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";
import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { Role } from "./users";
import { SINGLE_USER_EMAIL, SINGLE_USER_ID, isSingleUserMode } from "./single-user";

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
  // Single-user / no-auth mode: no JWT, no login — resolve to the built-in
  // admin (auto-provisioned so the settings.updated_by FK always resolves).
  if (isSingleUserMode()) return ensureSingleUserAdmin(db);
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

/**
 * Provision (idempotently) the built-in admin row used by single-user mode, so
 * every FK to users (settings.updated_by) resolves and the rest of the app sees
 * a normal admin. The password hash is unusable — login is bypassed in this
 * mode, so it is never checked.
 */
export async function ensureSingleUserAdmin(database: any = db): Promise<SessionUser> {
  const [existing] = await database
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, SINGLE_USER_ID))
    .limit(1);
  if (existing) return { id: existing.id, email: existing.email, role: existing.role as Role };
  const passwordHash = await hash(`${SINGLE_USER_ID}:disabled`, 10);
  await database
    .insert(users)
    .values({ id: SINGLE_USER_ID, email: SINGLE_USER_EMAIL, passwordHash, role: "admin" })
    .onConflictDoNothing();
  return { id: SINGLE_USER_ID, email: SINGLE_USER_EMAIL, role: "admin" };
}

/** For admin-only pages: redirects instead of returning a Response. */
export async function requireAdminUser(): Promise<SessionUser> {
  const user = await resolveSessionUser();
  if (!user) redirect("/login?reason=signed-out");
  if (user.role !== "admin") redirect("/settings?error=admin_only");
  return user;
}
