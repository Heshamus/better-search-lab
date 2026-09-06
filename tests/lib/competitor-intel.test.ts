import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveCompetitorKeywords, listCompetitorKeywords, listCompetitorTopPages } from "@/lib/competitor-intel";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("competitor intel", () => {
  it("saves+replaces per competitor and aggregates top pages", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveCompetitorKeywords(t.db, p.id, "rival.com", [
      { keyword: "a", rankAbsolute: 3, url: "https://rival.com/guide", volume: 500, difficulty: 20 },
      { keyword: "b", rankAbsolute: 7, url: "https://rival.com/guide", volume: 100, difficulty: 30 },
      { keyword: "c", rankAbsolute: 1, url: "https://rival.com/home", volume: 900, difficulty: 40 },
      { keyword: "d", rankAbsolute: null, url: "https://rival.com/other", volume: 50, difficulty: 15 },
    ]);

    const kws = await listCompetitorKeywords(t.db, p.id, "rival.com");
    // rank asc, NULL rank sorted LAST (not first) — a naive `a.rankAbsolute -
    // b.rankAbsolute` comparator would float "d" (null) to the front via
    // NaN/0 coercion instead; this pins the rankKey NULLS-LAST behavior.
    expect(kws.map((k) => k.keyword)).toEqual(["c", "a", "b", "d"]);
    expect(kws[kws.length - 1].rankAbsolute).toBeNull();

    const pages = await listCompetitorTopPages(t.db, p.id, "rival.com");
    expect(pages[0]).toMatchObject({ url: "https://rival.com/guide", keywordCount: 2 });
    expect(pages[0].topKeywords).toContain("a");

    // replace
    await saveCompetitorKeywords(t.db, p.id, "rival.com", [{ keyword: "z", rankAbsolute: 2, url: "https://rival.com/z", volume: 10, difficulty: 5 }]);
    expect((await listCompetitorKeywords(t.db, p.id, "rival.com")).map((k) => k.keyword)).toEqual(["z"]);
  });

  it("rolls back the delete when the insert fails — prior keywords survive", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await saveCompetitorKeywords(t.db, p.id, "rival.com", [
      { keyword: "keep me", rankAbsolute: 3, url: "https://rival.com/x", volume: 500, difficulty: 20 },
    ]);
    // `keyword` is NOT NULL, so a null keyword makes the INSERT throw *after*
    // the delete. Without the transaction the delete commits and the
    // competitor's keyword set is wiped; with it, the save rolls back.
    const bad = [{ keyword: null as any, rankAbsolute: 1, url: null, volume: 1, difficulty: 1 }];
    await expect(saveCompetitorKeywords(t.db, p.id, "rival.com", bad)).rejects.toThrow();
    expect((await listCompetitorKeywords(t.db, p.id, "rival.com")).map((k) => k.keyword)).toEqual(["keep me"]);
  });
});
