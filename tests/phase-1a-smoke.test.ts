// tests/phase-1a-smoke.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankRefreshHandler } from "@/lib/jobs/handlers/rank-refresh";
import { latestByKeyword } from "@/lib/core/history";
import { rankSnapshots, apiUsage } from "@/db/schema";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("phase-1a pipeline (offline)", () => {
  it("project → keywords → rank refresh → history + usage, no network", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockResolvedValue({ items: [{ rankAbsolute: 12, rankGroup: 11, domain: "example-site.com", url: "u", serpFeatures: [] }], rows: 3 });
    await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });

    const snaps = (await t.db.select().from(rankSnapshots)).map((s: any) => ({ keywordId: s.keywordId, capturedAt: s.capturedAt, rankAbsolute: s.rankAbsolute, fetchStatus: s.fetchStatus }));
    expect(latestByKeyword(snaps).get(kw.id)!.rankAbsolute).toBe(12);
    expect((await t.db.select().from(apiUsage)).length).toBeGreaterThan(0);
  });
});
