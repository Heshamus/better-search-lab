import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveResearchSearch, listRecentSearches } from "@/lib/research-history";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("research history", () => {
  it("saves searches newest-first and prunes to 20", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    for (let i = 0; i < 22; i++) await saveResearchSearch(t.db, p.id, `seed-${i}`, [{ keyword: `k${i}` }]);
    const recent = await listRecentSearches(t.db, p.id);
    expect(recent.length).toBe(20);           // pruned
    expect(recent[0].seed).toBe("seed-21");   // newest first
    expect(recent.some((r) => r.seed === "seed-0")).toBe(false); // oldest pruned
  });
});
