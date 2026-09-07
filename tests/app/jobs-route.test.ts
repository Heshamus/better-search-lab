import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-db");
  const t = await createTestDb();
  return { db: t.db };
});
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));

import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enqueueJob } from "@/lib/jobs/queue";
import { GET } from "@/app/api/jobs/[id]/route";

describe("GET /api/jobs/[id]", () => {
  it("returns status, error, finishedAt and progress", async () => {
    const id = await enqueueJob(db, { type: "profile_site" });
    await db.update(jobs).set({ status: "running", progress: "Crawling…" }).where(eq(jobs.id, id));
    const res = await GET(new Request("http://x") as any, { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, type: "profile_site", status: "running", progress: "Crawling…", error: null });
  });
  it("404s an unknown id", async () => {
    const res = await GET(new Request("http://x") as any, { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    expect(res.status).toBe(404);
  });
});
