import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords, listTrackedKeywords, setKeywordTracked } from "@/lib/keywords";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("keywords", () => {
  it("adds tracked keywords and lists them; untracking removes from the tracked list", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(1);
    await setKeywordTracked(t.db, kw.id, false);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(0);
  });
  it("skips a duplicate (project,keyword,location,language,device)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const row = { keyword: "x", locationCode: 2840, languageCode: "en" };
    await addKeywords(t.db, p.id, [row]);
    const second = await addKeywords(t.db, p.id, [row]);
    expect(second.length).toBe(0);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(1);
  });
});

describe("addKeywords re-tracking", () => {
  it("re-tracks a previously untracked keyword instead of silently no-oping", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [row] = await addKeywords(t.db, p.id, [{ keyword: "webflow seo", locationCode: 2840, languageCode: "en" }]);
    await setKeywordTracked(t.db, row.id, false);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(0);

    // re-adding the same keyword must bring it back as tracked
    await addKeywords(t.db, p.id, [{ keyword: "webflow seo", locationCode: 2840, languageCode: "en" }]);
    const tracked = await listTrackedKeywords(t.db, p.id);
    expect(tracked.map((k: any) => k.keyword)).toEqual(["webflow seo"]);
  });

  it("does not create a duplicate row when re-tracking", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const [row] = await addKeywords(t.db, p.id, [{ keyword: "geo", locationCode: 2840, languageCode: "en" }]);
    await setKeywordTracked(t.db, row.id, false);
    await addKeywords(t.db, p.id, [{ keyword: "geo", locationCode: 2840, languageCode: "en" }]);
    // exactly one row for this keyword
    const { keywords } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const all = await t.db.select().from(keywords).where(and(eq(keywords.projectId, p.id), eq(keywords.keyword, "geo")));
    expect(all.length).toBe(1);
    expect(all[0].isTracked).toBe(true);
  });
});
