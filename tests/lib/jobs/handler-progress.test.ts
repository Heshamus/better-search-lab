import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { addCompetitor } from "@/lib/competitors";
import { rankRefreshHandler } from "@/lib/jobs/handlers/rank-refresh";
import { gapRefreshHandler } from "@/lib/jobs/handlers/gap-refresh";
import { siteAuditHandler } from "@/lib/jobs/handlers/site-audit";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const labsEmpty = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] };
const serpEmpty = { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] };

describe("handlers report progress", () => {
  it("rank-refresh counts keywords", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    await addKeywords(t.db, p.id, [
      { keyword: "one", locationCode: 2840, languageCode: "en" },
      { keyword: "two", locationCode: 2840, languageCode: "en" },
    ]);
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => ok(serpEmpty)) });
    const seen: string[] = [];
    await rankRefreshHandler(client)({ db: t.db, projectId: p.id, progress: async (m) => { seen.push(m); } });
    expect(seen).toEqual(expect.arrayContaining(["Checking keyword 1 of 2", "Checking keyword 2 of 2"]));
  });

  it("gap-refresh names each competitor", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    await addCompetitor(t.db, p.id, "rival.example");
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => ok(labsEmpty)) });
    const seen: string[] = [];
    await gapRefreshHandler(client)({ db: t.db, projectId: p.id, progress: async (m) => { seen.push(m); } });
    expect(seen).toEqual(["Comparing with rival.example (1 of 1)"]);
  });

  it("site-audit reports crawling and scoring, and runs without a progress callback", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "example-site.com" });
    const fetchImpl = vi.fn(async () => new Response("<html><head><title>t</title></head><body><p>hello</p></body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    const seen: string[] = [];
    await siteAuditHandler({ fetchImpl })({ db: t.db, projectId: p.id, progress: async (m) => { seen.push(m); } });
    expect(seen[0]).toBe("Crawling example-site.com…");
    expect(seen.at(-1)).toMatch(/^Scoring \d+ pages?$/);
    await expect(siteAuditHandler({ fetchImpl })({ db: t.db, projectId: p.id })).resolves.toMatchObject({ cost: 0 });
  });
});
