import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveBacklinks, getBacklinksHistory } from "@/lib/backlinks-store";
import type { BacklinkSummary, ReferringDomain } from "@/lib/dataforseo/backlinks";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

function summary(overrides: Partial<BacklinkSummary> = {}): BacklinkSummary {
  return {
    rank: 200,
    backlinks: 100,
    referringDomains: 10,
    referringMainDomains: 10,
    dofollow: 80,
    nofollow: 20,
    brokenBacklinks: 0,
    spamScore: 5,
    referringPages: 100,
    tldDistribution: [],
    ...overrides,
  };
}

function domain(name: string, overrides: Partial<ReferringDomain> = {}): ReferringDomain {
  return { domain: name, backlinks: 5, rank: 100, spamScore: 2, ...overrides };
}

describe("getBacklinksHistory", () => {
  it("returns saved snapshots oldest→newest with mapped fields", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    // Separate sequential saves past a real elapsed-time boundary: PGlite's
    // defaultNow() can tie for statements landing in the same millisecond
    // (see tests/lib/reddit/conversations-store.test.ts), which would make
    // asc(createdAt) ordering ambiguous rather than matching insertion order.
    await saveBacklinks(t.db, p.id, {
      summary: summary({ backlinks: 100, referringDomains: 10, rank: 200 }),
      referringDomains: [domain("a.com"), domain("b.com")],
      anchors: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await saveBacklinks(t.db, p.id, {
      summary: summary({ backlinks: 150, referringDomains: 12, rank: 220 }),
      referringDomains: [domain("a.com"), domain("b.com"), domain("c.com")],
      anchors: [],
    });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await saveBacklinks(t.db, p.id, {
      summary: summary({ backlinks: 180, referringDomains: 11, rank: 240 }),
      referringDomains: [domain("a.com"), domain("c.com")],
      anchors: [],
    });

    const history = await getBacklinksHistory(t.db, p.id);

    expect(history).toHaveLength(3);
    expect(history.map((h) => h.backlinks)).toEqual([100, 150, 180]); // oldest → newest
    expect(history.map((h) => h.referringDomains)).toEqual([10, 12, 11]);
    expect(history.map((h) => h.rank)).toEqual([200, 220, 240]);
    expect(history[0].domains).toEqual(["a.com", "b.com"]);
    expect(history[1].domains).toEqual(["a.com", "b.com", "c.com"]);
    expect(history[2].domains).toEqual(["a.com", "c.com"]);
    expect(history.every((h) => h.at instanceof Date)).toBe(true);
    // Strictly increasing timestamps confirm real asc ordering, not insertion luck.
    expect(history[0].at.getTime()).toBeLessThan(history[1].at.getTime());
    expect(history[1].at.getTime()).toBeLessThan(history[2].at.getTime());
  });

  it("maps a null summary.rank through as null (the pure trends module does the →0 coercion)", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    await saveBacklinks(t.db, p.id, { summary: summary({ rank: null }), referringDomains: [], anchors: [] });

    const [row] = await getBacklinksHistory(t.db, p.id);
    expect(row.rank).toBeNull();
  });

  it("returns an empty array when the project has no snapshots", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    expect(await getBacklinksHistory(t.db, p.id)).toEqual([]);
  });

  it("limit returns the most-recent N snapshots (not the oldest N), still oldest→newest", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

    await saveBacklinks(t.db, p.id, { summary: summary({ backlinks: 100 }), referringDomains: [], anchors: [] });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await saveBacklinks(t.db, p.id, { summary: summary({ backlinks: 150 }), referringDomains: [], anchors: [] });
    await new Promise((resolve) => setTimeout(resolve, 15));
    await saveBacklinks(t.db, p.id, { summary: summary({ backlinks: 180 }), referringDomains: [], anchors: [] });

    const history = await getBacklinksHistory(t.db, p.id, 2);

    expect(history).toHaveLength(2);
    // The 2 MOST RECENT snapshots (150, 180) — not the 2 oldest (100, 150) —
    // returned in ascending order.
    expect(history.map((h) => h.backlinks)).toEqual([150, 180]);
    expect(history[0].at.getTime()).toBeLessThan(history[1].at.getTime());
  });

  it("is scoped per project — a snapshot saved for a different project is excluded", async () => {
    const t = await createTestDb();
    close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.io" });

    await saveBacklinks(t.db, p1.id, { summary: summary({ backlinks: 100 }), referringDomains: [], anchors: [] });
    await saveBacklinks(t.db, p2.id, { summary: summary({ backlinks: 999 }), referringDomains: [], anchors: [] });

    const history = await getBacklinksHistory(t.db, p1.id);
    expect(history).toHaveLength(1);
    expect(history[0].backlinks).toBe(100);
  });
});
