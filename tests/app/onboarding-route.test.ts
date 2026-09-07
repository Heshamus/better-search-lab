import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));

import { db } from "@/db/client";
import { createProject } from "@/lib/projects";
import { PATCH } from "@/app/api/projects/[id]/onboarding/route";

const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }) as any, { params: Promise.resolve({ id }) });

describe("PATCH /api/projects/[id]/onboarding", () => {
  it("merges a valid patch, 400s an invalid one, 404s an unknown project", async () => {
    const p = await createProject(db, { name: "A", domain: "example-site.com" });
    const ok = await patch(p.id, { competitors: "skipped" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).onboarding).toMatchObject({ competitors: "skipped", profile: "pending" });
    expect((await patch(p.id, { build: "exploded" })).status).toBe(400);
    expect((await patch("00000000-0000-4000-8000-000000000000", { profile: "done" })).status).toBe(404);
  });
  it("404s a malformed id instead of letting it reach the database", async () => {
    const res = await patch("not-a-uuid", { profile: "done" });
    expect(res.status).toBe(404);
  });
});
