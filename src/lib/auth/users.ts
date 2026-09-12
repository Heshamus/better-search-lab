import { and, asc, eq, sql } from "drizzle-orm";
import { compare, hash } from "bcryptjs";
import { users } from "@/db/schema";

// All user management. Every mutation runs inside ONE transaction that first
// takes a transaction-scoped advisory lock, so two concurrent requests are
// serialized: a bare INSERT … WHERE NOT EXISTS is not enough under READ
// COMMITTED (both snapshot an empty table and both insert), and the same race
// would let two admins demote each other down to zero (spec §9.1, §9.2).

export type Role = "admin" | "member";
export const MIN_PASSWORD_LENGTH = 10;
const BCRYPT_COST = 10;

export interface UserSummary {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export class AdminAlreadyExistsError extends Error { name = "AdminAlreadyExistsError"; }
export class LastAdminError extends Error { name = "LastAdminError"; }
export class SelfDeleteError extends Error { name = "SelfDeleteError"; }
export class UserNotFoundError extends Error { name = "UserNotFoundError"; }
export class InvalidPasswordError extends Error { name = "InvalidPasswordError"; }
export class EmailTakenError extends Error { name = "EmailTakenError"; }
export class WeakPasswordError extends Error { name = "WeakPasswordError"; }
export class NotSoleUserError extends Error { name = "NotSoleUserError"; }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertStrongPassword(pw: string): void {
  if (typeof pw !== "string" || pw.length < MIN_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

const summary = (r: { id: string; email: string; role: string; createdAt: Date; lastLoginAt: Date | null }): UserSummary => ({
  id: r.id, email: r.email, role: r.role as Role, createdAt: r.createdAt, lastLoginAt: r.lastLoginAt,
});

/** Serialize every user mutation behind one advisory lock, inside a transaction. */
export async function withUsersLock<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bsl:users'))`);
    return fn(tx);
  });
}

async function count(dbOrTx: any, where?: ReturnType<typeof sql>): Promise<number> {
  const rows = await dbOrTx.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  return Number(rows[0]?.n ?? 0);
}

export async function countUsers(db: any): Promise<number> {
  return count(db);
}

export async function findUserByEmail(db: any, email: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash, role: users.role, sessionVersion: users.sessionVersion })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return row ? { ...row, role: row.role as Role } : null;
}

export async function listUsers(db: any): Promise<UserSummary[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .orderBy(asc(users.createdAt));
  return rows.map(summary);
}

export async function createFirstAdmin(db: any, input: { email: string; password: string }): Promise<UserSummary> {
  assertStrongPassword(input.password);
  const email = normalizeEmail(input.email);
  const passwordHash = await hash(input.password, BCRYPT_COST);
  return withUsersLock(db, async (tx) => {
    if ((await count(tx)) > 0) throw new AdminAlreadyExistsError("an admin already exists — sign in");
    const [row] = await tx.insert(users).values({ email, passwordHash, role: "admin" }).returning();
    return summary(row);
  });
}

export async function createUser(db: any, input: { email: string; password: string; role: Role }): Promise<UserSummary> {
  assertStrongPassword(input.password);
  const email = normalizeEmail(input.email);
  const passwordHash = await hash(input.password, BCRYPT_COST);
  return withUsersLock(db, async (tx) => {
    const taken = await count(tx, sql`lower(${users.email}) = ${email}`);
    if (taken > 0) throw new EmailTakenError("a user with that email already exists");
    const [row] = await tx.insert(users).values({ email, passwordHash, role: input.role }).returning();
    return summary(row);
  });
}

export async function updateUserRole(db: any, id: string, role: Role): Promise<void> {
  await withUsersLock(db, async (tx) => {
    const [row] = await tx.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!row) throw new UserNotFoundError("user not found");
    if (row.role === "admin" && role !== "admin") {
      const admins = await count(tx, eq(users.role, "admin"));
      if (admins <= 1) throw new LastAdminError("cannot demote the last admin");
    }
    await tx.update(users).set({ role }).where(eq(users.id, id));
  });
}

export async function resetUserPassword(db: any, id: string, newPassword: string): Promise<void> {
  assertStrongPassword(newPassword);
  const passwordHash = await hash(newPassword, BCRYPT_COST);
  await withUsersLock(db, async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (updated.length === 0) throw new UserNotFoundError("user not found");
  });
}

export async function deleteUser(db: any, id: string, opts: { actorId: string }): Promise<void> {
  if (id === opts.actorId) throw new SelfDeleteError("you cannot delete your own account");
  await withUsersLock(db, async (tx) => {
    const [row] = await tx.select({ role: users.role }).from(users).where(eq(users.id, id));
    if (!row) throw new UserNotFoundError("user not found");
    if (row.role === "admin") {
      const admins = await count(tx, eq(users.role, "admin"));
      if (admins <= 1) throw new LastAdminError("cannot delete the last admin");
    }
    await tx.delete(users).where(eq(users.id, id));
  });
}

/**
 * Self-service reset for a SINGLE-USER install: the sole user deletes their own
 * login, dropping the user count to zero so the app returns to /setup for a
 * fresh admin. Refused when more than one user exists — in a team the
 * self-delete / last-admin guards on deleteUser() apply and a teammate removes
 * you instead. Global (single-tenant) data is untouched; the one FK to users
 * (settings.updated_by) is ON DELETE SET NULL.
 */
export async function deleteOwnAccount(db: any, actorId: string): Promise<void> {
  await withUsersLock(db, async (tx) => {
    const total = await count(tx, sql`true`);
    if (total !== 1) throw new NotSoleUserError("account deletion is only available on a single-user install");
    await tx.delete(users).where(eq(users.id, actorId));
  });
}

export async function changeOwnPassword(db: any, id: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
  assertStrongPassword(input.newPassword);
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id));
  if (!row) throw new UserNotFoundError("user not found");
  if (!(await compare(input.currentPassword, row.passwordHash))) throw new InvalidPasswordError("current password is incorrect");
  const passwordHash = await hash(input.newPassword, BCRYPT_COST);
  await withUsersLock(db, async (tx) => {
    // Optimistic guard: replace only the hash we just verified. If an admin
    // reset landed in between, the credential we checked is stale and must not
    // win — the update matches zero rows and we report it as a wrong password.
    const updated = await tx
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(and(eq(users.id, id), eq(users.passwordHash, row.passwordHash)))
      .returning({ id: users.id });
    if (updated.length === 0) throw new InvalidPasswordError("current password is incorrect");
  });
}

/** Best-effort bookkeeping; a failure here must never block sign-in. */
export async function touchLastLogin(db: any, id: string): Promise<void> {
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, id));
  } catch {
    // ignore
  }
}
