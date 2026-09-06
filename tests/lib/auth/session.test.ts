import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { db } from "@/db/client";
import { createFirstAdmin, resetUserPassword, deleteUser, createUser } from "@/lib/auth/users";
import { resolveSessionUser } from "@/lib/auth/session";

const PW = "correct horse battery";

describe("resolveSessionUser", () => {
  beforeEach(() => (auth as any).mockReset());

  it("returns the user when the JWT's version matches the row, reading the role from the DB", async () => {
    const admin = await createFirstAdmin(db, { email: "a@example.com", password: PW });
    (auth as any).mockResolvedValue({ user: { id: admin.id }, sv: 1 });
    expect(await resolveSessionUser()).toEqual({ id: admin.id, email: "a@example.com", role: "admin" });
  });

  it("returns null for no session, a token without sv, a bumped version, or a deleted user", async () => {
    const m = await createUser(db, { email: "m@example.com", password: PW, role: "member" });
    (auth as any).mockResolvedValue(null);
    expect(await resolveSessionUser()).toBeNull();
    (auth as any).mockResolvedValue({ user: { id: m.id } }); // pre-upgrade token: no sv
    expect(await resolveSessionUser()).toBeNull();
    (auth as any).mockResolvedValue({ user: { id: m.id }, sv: 1 });
    expect((await resolveSessionUser())?.role).toBe("member");
    await resetUserPassword(db, m.id, "another strong one");
    expect(await resolveSessionUser()).toBeNull(); // sv is now 2
    (auth as any).mockResolvedValue({ user: { id: m.id }, sv: 2 });
    expect(await resolveSessionUser()).not.toBeNull();
    const admins = (await import("@/lib/auth/users")).listUsers;
    const a = (await admins(db)).find((u) => u.role === "admin")!;
    await deleteUser(db, m.id, { actorId: a.id });
    expect(await resolveSessionUser()).toBeNull();
  });
});
