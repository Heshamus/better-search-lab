import { describe, it, expect, vi } from "vitest";

const seeded = vi.hoisted(() => ({ adminId: "" }));
vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const { createFirstAdmin } = await import("@/lib/auth/users");
  const t = await createTestDb();
  const admin = await createFirstAdmin(t.db, { email: "a@example.com", password: "correct horse battery" });
  seeded.adminId = admin.id;
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: seeded.adminId, email: "a@example.com", role: "admin" })) }));

import { db } from "@/db/client";
import { resolveSessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/config/resolve";
import { POST } from "@/app/api/setup/state/route";

const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any);

describe("POST /api/setup/state", () => {
  it("records the AI step and completion, readable through getConfig", async () => {
    expect((await post({ llmStep: "skipped" })).status).toBe(200);
    expect((await getConfig(db, { fresh: true })).setup.llmStep).toBe("skipped");
    expect((await post({ completed: true })).status).toBe(200);
    const cfg = await getConfig(db, { fresh: true });
    expect(cfg.setup.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(cfg.setup.configured).toBe(true);
  });
  it("400s an unknown value and 403s a member", async () => {
    expect((await post({ llmStep: "later" })).status).toBe(400);
    (resolveSessionUser as any).mockResolvedValueOnce({ id: seeded.adminId, email: "m@example.com", role: "member" });
    expect((await post({ llmStep: "done" })).status).toBe(403);
  });
});
