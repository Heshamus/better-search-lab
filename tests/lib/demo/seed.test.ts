import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { DEMO_ADMIN, DEMO_MCP_TOKEN, seedDemo } from "@/lib/demo/seed";
import { findUserByEmail } from "@/lib/auth/users";
import { validateApiToken } from "@/lib/api-tokens";
import { listProjects } from "@/lib/projects";
import { computeDashboard } from "@/lib/dashboard";
import { listOpportunities } from "@/lib/opportunities";
import { listRankings, getAveragePositionHistory } from "@/lib/rankings";
import { listCompetitors, listGapSignals } from "@/lib/competitors";
import { listCompetitorKeywords } from "@/lib/competitor-intel";
import { getOrganicKeywords } from "@/lib/organic-keywords-store";
import { latestBacklinks, getBacklinksHistory } from "@/lib/backlinks-store";
import { latestAudit } from "@/lib/audit/store";
import { getGscData, getGaData } from "@/lib/google/store";
import { getLatestScan, getScanHistory } from "@/lib/ai-visibility/store";
import { listLatestConversations } from "@/lib/reddit/conversations-store";
import { usageSummary } from "@/lib/usage";
import { getConfig } from "@/lib/config/resolve";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of closers.splice(0)) await c(); });
const now = new Date("2026-09-07T12:00:00Z");

describe("demo seeder (spec §13)", () => {
  it("fills every page for both projects and the engine finds real opportunities", { timeout: 180_000 }, async () => {
    const t = await createTestDb(); closers.push(t.close);
    const { projectIds } = await seedDemo(t.db, { now });
    expect(projectIds).toHaveLength(2);
    expect(await findUserByEmail(t.db, DEMO_ADMIN.email)).toMatchObject({ role: "admin" });
    expect(await validateApiToken(t.db, DEMO_MCP_TOKEN)).toBe(true);
    // listProjects has no ORDER BY, so sort on a stable key rather than asserting insertion order.
    expect([...(await listProjects(t.db))].sort((a: any, b: any) => a.domain.localeCompare(b.domain)).map((p: any) => p.name))
      .toEqual(["Harbor & Vale Legal", "Northwind Outdoor"]);
    expect((await getConfig(t.db, { fresh: true })).setup.completedAt).toBeTruthy();

    for (const [i, id] of projectIds.entries()) {
      const dash = await computeDashboard(t.db, id);
      expect(dash.keywordsTracked).toBe(i === 0 ? 140 : 40);
      expect((await listRankings(t.db, id, now)).length).toBe(i === 0 ? 140 : 40);
      expect((await getAveragePositionHistory(t.db, id)).points.length).toBeGreaterThan(30);
      expect((await listCompetitors(t.db, id)).length).toBe(i === 0 ? 3 : 2);
      expect((await listGapSignals(t.db, id)).length).toBeGreaterThan(20);
      expect((await listCompetitorKeywords(t.db, id, (await listCompetitors(t.db, id))[0].domain)).length).toBeGreaterThan(10);
      expect((await getOrganicKeywords(t.db, id)).rows.length).toBeGreaterThan(10);
      expect(await latestBacklinks(t.db, id)).not.toBeNull();
      expect((await getBacklinksHistory(t.db, id)).length).toBe(12);
      expect((await latestAudit(t.db, id))?.issues.length).toBeGreaterThan(0);
      expect((await getGscData(t.db, id))?.daily.length).toBe(90);
      expect((await getGaData(t.db, id))?.daily.length).toBe(90);
      expect(await getLatestScan(t.db, id)).not.toBeNull();
      expect((await getScanHistory(t.db, id, 30)).length).toBe(8);
      expect((await listLatestConversations(t.db, id, 20)).length).toBe(6);
      expect((await usageSummary(t.db, id)).total).toBeGreaterThan(0);
      const opps = await listOpportunities(t.db, id);
      expect(opps.length).toBeGreaterThanOrEqual(i === 0 ? 10 : 3);
    }
  });

  it("is deterministic: two databases, identical opportunity sets and rankings", { timeout: 240_000 }, async () => {
    const a = await createTestDb(); closers.push(a.close);
    const b = await createTestDb(); closers.push(b.close);
    const ra = await seedDemo(a.db, { now });
    const rb = await seedDemo(b.db, { now });
    // listOpportunities orders by score alone and listRankings not at all, so
    // rows tied on the ordering column may come back in either row order.
    // Both sides are sorted on a stable key before comparing, so a difference
    // here is a difference in the DATA, never in the row order.
    const fingerprint = async (db: any, id: string) => ({
      opps: (await listOpportunities(db, id))
        .map((o: any) => [o.keyword, o.type, Number(o.score.toFixed(4))])
        .sort((a: any[], b: any[]) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`)),
      ranks: (await listRankings(db, id, now)).map((r) => [r.keyword, r.rankAbsolute]).sort(),
    });
    expect(await fingerprint(a.db, ra.projectIds[0])).toEqual(await fingerprint(b.db, rb.projectIds[0]));
    expect(await fingerprint(a.db, ra.projectIds[1])).toEqual(await fingerprint(b.db, rb.projectIds[1]));
  });

  it("refuses to run twice into the same database", { timeout: 120_000 }, async () => {
    const t = await createTestDb(); closers.push(t.close);
    await seedDemo(t.db, { now });
    await expect(seedDemo(t.db, { now })).rejects.toThrow(/already seeded/);
  });
});
