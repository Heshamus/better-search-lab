import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { rankSnapshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rankRefreshHandler } from "@/lib/jobs/handlers/rank-refresh";
import { DataForSeoClient } from "@/lib/dataforseo/client";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("rankRefreshHandler", () => {
  it("writes an ok snapshot for a found domain and logs usage", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockResolvedValue({ items: [{ rankAbsolute: 12, rankGroup: 11, domain: "harperflow.io", url: "https://harperflow.io/x", serpFeatures: ["featured_snippet"] }], rows: 5 });
    const r = await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.fetchStatus).toBe("ok");
    expect(snap.rankAbsolute).toBe(12);
    expect(snap.serpFeatures).toContain("featured_snippet");
    expect(r.rows).toBeGreaterThan(0);
  });
  it("stores fetch_status=failed (no fake rank) when SERP throws", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "x", locationCode: 2840, languageCode: "en" }]);
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const serp = vi.fn().mockRejectedValue(new Error("timeout"));
    await rankRefreshHandler(client, serp)({ db: t.db, projectId: p.id });
    const [snap] = await t.db.select().from(rankSnapshots).where(eq(rankSnapshots.keywordId, kw.id));
    expect(snap.fetchStatus).toBe("failed");
    expect(snap.rankAbsolute).toBeNull();
    expect(snap.reason).toContain("timeout");
  });
});
