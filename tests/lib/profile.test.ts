import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveProfileCandidates, listProfileCandidates, clearProfileCandidates } from "@/lib/profile";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("profile candidates", () => {
  it("saves, lists, and replaces candidates for a project", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveProfileCandidates(t.db, p.id, [
      { keyword: "webflow seo", source: "crawl", volume: 300, difficulty: 20 },
      { keyword: "geo optimization", source: "expansion", volume: 90, difficulty: null },
    ]);
    let rows = await listProfileCandidates(t.db, p.id);
    expect(rows.map((r) => r.keyword).sort()).toEqual(["geo optimization", "webflow seo"]);
    expect(rows.every((r) => r.selected)).toBe(true);

    // replace: a second save wipes the first
    await saveProfileCandidates(t.db, p.id, [{ keyword: "ai autopilot", source: "ranking", volume: 10, difficulty: 5 }]);
    rows = await listProfileCandidates(t.db, p.id);
    expect(rows.map((r) => r.keyword)).toEqual(["ai autopilot"]);

    await clearProfileCandidates(t.db, p.id);
    expect(await listProfileCandidates(t.db, p.id)).toEqual([]);
  });

  it("rolls back the delete when the insert fails — prior candidates survive", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await saveProfileCandidates(t.db, p.id, [{ keyword: "keep me", source: "crawl", volume: 100, difficulty: 10 }]);
    // `keyword` is NOT NULL, so a null keyword makes the INSERT throw *after*
    // the delete. Without the transaction the delete commits and the candidate
    // set is wiped; with it, the save rolls back and "keep me" survives.
    const bad = [{ keyword: null as any, source: "crawl" as const, volume: 1, difficulty: 1 }];
    await expect(saveProfileCandidates(t.db, p.id, bad)).rejects.toThrow();
    expect((await listProfileCandidates(t.db, p.id)).map((r) => r.keyword)).toEqual(["keep me"]);
  });
});
