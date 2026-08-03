import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveProfileCandidates, listProfileCandidates, clearProfileCandidates } from "@/lib/profile";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("profile candidates", () => {
  it("saves, lists, and replaces candidates for a project", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });

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
});
