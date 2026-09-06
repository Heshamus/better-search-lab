import { describe, it, expect, afterEach } from "vitest";
import { compare } from "bcryptjs";
import { createTestDb } from "@/db/test-db";
import {
  AdminAlreadyExistsError, EmailTakenError, InvalidPasswordError, LastAdminError, SelfDeleteError, UserNotFoundError, WeakPasswordError,
  changeOwnPassword, countUsers, createFirstAdmin, createUser, deleteUser, findUserByEmail, listUsers, normalizeEmail,
  resetUserPassword, touchLastLogin, updateUserRole,
} from "@/lib/auth/users";

let close: () => Promise<void>;
afterEach(() => close?.());

const PW = "correct horse battery";

describe("users", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("creates the first admin only on an empty table, with a bcrypt hash", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await countUsers(t.db)).toBe(0);
    const admin = await createFirstAdmin(t.db, { email: "Owner@Example.com", password: PW });
    expect(admin.role).toBe("admin");
    expect(admin.email).toBe("owner@example.com");
    const row = await findUserByEmail(t.db, "OWNER@example.com");
    expect(row?.sessionVersion).toBe(1);
    expect(await compare(PW, row!.passwordHash)).toBe(true);
    await expect(createFirstAdmin(t.db, { email: "x@example.com", password: PW })).rejects.toBeInstanceOf(AdminAlreadyExistsError);
    expect(await countUsers(t.db)).toBe(1);
  });

  it("rejects weak passwords and duplicate emails (case-insensitively)", async () => {
    const t = await createTestDb(); close = t.close;
    await expect(createFirstAdmin(t.db, { email: "o@example.com", password: "short" })).rejects.toBeInstanceOf(WeakPasswordError);
    await createFirstAdmin(t.db, { email: "o@example.com", password: PW });
    await expect(createUser(t.db, { email: "O@EXAMPLE.com", password: PW, role: "member" })).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("lists users, changes roles, and protects the last admin", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const m = await createUser(t.db, { email: "m@example.com", password: PW, role: "member" });
    expect((await listUsers(t.db)).map((u) => u.email)).toEqual(["a@example.com", "m@example.com"]);
    await expect(updateUserRole(t.db, a.id, "member")).rejects.toBeInstanceOf(LastAdminError);
    await updateUserRole(t.db, m.id, "admin");
    await updateUserRole(t.db, a.id, "member"); // now allowed: m is admin
    expect((await listUsers(t.db)).find((u) => u.id === a.id)?.role).toBe("member");
  });

  it("deletion: never yourself, never the last admin", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const m = await createUser(t.db, { email: "m@example.com", password: PW, role: "member" });
    await expect(deleteUser(t.db, a.id, { actorId: a.id })).rejects.toBeInstanceOf(SelfDeleteError);
    await expect(deleteUser(t.db, a.id, { actorId: m.id })).rejects.toBeInstanceOf(LastAdminError);
    await deleteUser(t.db, m.id, { actorId: a.id });
    expect(await countUsers(t.db)).toBe(1);
  });

  it("password reset and own-password change bump session_version; own change needs the current password", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    await resetUserPassword(t.db, a.id, "another strong one");
    let row = await findUserByEmail(t.db, "a@example.com");
    expect(row?.sessionVersion).toBe(2);
    expect(await compare("another strong one", row!.passwordHash)).toBe(true);

    await expect(changeOwnPassword(t.db, a.id, { currentPassword: "wrong wrong wrong", newPassword: "third strong one!" })).rejects.toBeInstanceOf(InvalidPasswordError);
    await changeOwnPassword(t.db, a.id, { currentPassword: "another strong one", newPassword: "third strong one!" });
    row = await findUserByEmail(t.db, "a@example.com");
    expect(row?.sessionVersion).toBe(3);
  });

  it("stamps last login", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    await touchLastLogin(t.db, a.id);
    expect((await listUsers(t.db))[0].lastLoginAt).toBeInstanceOf(Date);
  });

  it("raises UserNotFoundError for an unknown id on every per-user mutation", async () => {
    const t = await createTestDb(); close = t.close;
    await createFirstAdmin(t.db, { email: "a@example.com", password: PW });
    const ghost = "00000000-0000-4000-8000-000000000000";
    await expect(updateUserRole(t.db, ghost, "member")).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(resetUserPassword(t.db, ghost, "another strong one")).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(deleteUser(t.db, ghost, { actorId: "11111111-1111-4111-8111-111111111111" })).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(changeOwnPassword(t.db, ghost, { currentPassword: PW, newPassword: "another strong one" })).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
