import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords, listTrackedKeywords, setKeywordTracked } from "@/lib/keywords";

let close: () => Promise<void>;
afterEach(() => close?.());

describe("keywords", () => {
  it("adds tracked keywords and lists them; untracking removes from the tracked list", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const [kw] = await addKeywords(t.db, p.id, [{ keyword: "seo reporting software", locationCode: 2840, languageCode: "en" }]);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(1);
    await setKeywordTracked(t.db, kw.id, false);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(0);
  });
  it("skips a duplicate (project,keyword,location,language,device)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
    const row = { keyword: "x", locationCode: 2840, languageCode: "en" };
    await addKeywords(t.db, p.id, [row]);
    const second = await addKeywords(t.db, p.id, [row]);
    expect(second.length).toBe(0);
    expect((await listTrackedKeywords(t.db, p.id)).length).toBe(1);
  });
});
