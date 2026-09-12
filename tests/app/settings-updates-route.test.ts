import { describe, it, expect, vi } from "vitest";

const seeded = vi.hoisted(() => ({ adminId: "" }));
vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const { createFirstAdmin } = await import("@/lib/auth/users");
  const t = await createTestDb();
  // settings.updated_by is a FK to users.id, so the acting admin must exist.
  const admin = await createFirstAdmin(t.db, { email: "a@example.com", password: "correct horse battery" });
  seeded.adminId = admin.id;
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({
  resolveSessionUser: vi.fn(async () => ({ id: seeded.adminId, email: "a@example.com", role: "admin" })),
}));

import { db } from "@/db/client";
import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { PATCH } from "@/app/api/settings/updates/route";

const patch = (body: unknown) =>
  PATCH(
    new Request("http://x/api/settings/updates", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as any,
  );

describe("PATCH /api/settings/updates", () => {
  it("is admin-only: 401 with no session, 403 for a member", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await patch({ checkEnabled: false })).status).toBe(401);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: seeded.adminId, email: "m@example.com", role: "member" });
    expect((await patch({ checkEnabled: false })).status).toBe(403);
  });

  it("400s an invalid body", async () => {
    expect((await patch({ checkEnabled: "not-a-boolean" })).status).toBe(400);
  });

  it("persists checkEnabled: false, readable through getConfig", async () => {
    const res = await patch({ checkEnabled: false });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect((await getConfig(db, { fresh: true })).updates.checkEnabled).toBe(false);
  });

  it("persists dismissVersion", async () => {
    const res = await patch({ dismissVersion: "1.2.0" });
    expect(res.status).toBe(200);
    expect((await getConfig(db, { fresh: true })).updates.dismissedVersion).toBe("1.2.0");
  });

  it("persists dismissFirstRun as a non-empty ISO timestamp", async () => {
    const res = await patch({ dismissFirstRun: true });
    expect(res.status).toBe(200);
    const cfg = await getConfig(db, { fresh: true });
    expect(cfg.updates.firstRunDismissedAt).toBeTruthy();
    expect(cfg.updates.firstRunDismissedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
