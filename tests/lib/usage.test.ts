import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { apiUsage } from "@/db/schema";
import { usageSummary } from "@/lib/usage";

let close: () => Promise<void>;
afterEach(() => close?.());

const d = (s: string) => new Date(s + "T00:00:00Z");

describe("usageSummary", () => {
  it("aggregates total, byDay, and byEndpoint across 3 rows spanning 2 days/2 endpoints", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    await t.db.insert(apiUsage).values([
      { occurredAt: d("2026-08-01"), projectId: p.id, endpoint: "serp", rows: 5, estCost: "0.50" },
      { occurredAt: d("2026-08-01"), projectId: p.id, endpoint: "labs", rows: 3, estCost: "0.25" },
      { occurredAt: d("2026-08-02"), projectId: p.id, endpoint: "serp", rows: 2, estCost: "0.10" },
    ]);
    const s = await usageSummary(t.db, p.id);
    expect(typeof s.total).toBe("number"); // numeric column comes back as a string — must be parsed, not concatenated
    expect(s.total).toBeCloseTo(0.85, 5);

    const byDay = Object.fromEntries(s.byDay.map((r) => [r.day, r.cost]));
    expect(byDay["2026-08-01"]).toBeCloseTo(0.75, 5);
    expect(byDay["2026-08-02"]).toBeCloseTo(0.10, 5);
    expect(s.byDay.map((r) => r.day)).toEqual(["2026-08-01", "2026-08-02"]); // chronological

    const byEndpoint = Object.fromEntries(s.byEndpoint.map((r) => [r.endpoint, r]));
    expect(byEndpoint.serp.cost).toBeCloseTo(0.60, 5);
    expect(byEndpoint.serp.rows).toBe(7);
    expect(byEndpoint.labs.cost).toBeCloseTo(0.25, 5);
    expect(byEndpoint.labs.rows).toBe(3);
  });

  it("scopes to a projectId when given, and summarizes across all projects when omitted", async () => {
    const t = await createTestDb(); close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.com" });
    await t.db.insert(apiUsage).values([
      { occurredAt: d("2026-08-01"), projectId: p1.id, endpoint: "serp", rows: 1, estCost: "1.00" },
      { occurredAt: d("2026-08-01"), projectId: p2.id, endpoint: "serp", rows: 1, estCost: "2.00" },
    ]);
    const scoped = await usageSummary(t.db, p1.id);
    expect(scoped.total).toBeCloseTo(1.00, 5);

    const all = await usageSummary(t.db);
    expect(all.total).toBeCloseTo(3.00, 5);
  });

  it("returns an honest empty summary when there are no usage rows", async () => {
    const t = await createTestDb(); close = t.close;
    const s = await usageSummary(t.db);
    expect(s.total).toBe(0);
    expect(s.byDay).toEqual([]);
    expect(s.byEndpoint).toEqual([]);
  });
});
