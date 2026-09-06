import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { replaceOrganicKeywords, getOrganicKeywords, type OrganicKeywordRow } from "@/lib/organic-keywords-store";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const row = (keyword: string, position: number, volume: number): OrganicKeywordRow => ({
  keyword, position, searchVolume: volume, difficulty: 30, url: `https://example-site.com/${keyword}`, estTraffic: volume / 2,
});

describe("organic-keywords-store", () => {
  it("replace-all wipes the prior snapshot and stores the new rows with a capturedAt", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await replaceOrganicKeywords(t.db, p.id, [row("alpha", 3, 100), row("beta", 8, 50)]);
    let got = await getOrganicKeywords(t.db, p.id);
    expect(got.rows.map((r) => r.keyword).sort()).toEqual(["alpha", "beta"]);
    expect(got.capturedAt).toBeInstanceOf(Date);

    // A second refresh replaces, not appends.
    await replaceOrganicKeywords(t.db, p.id, [row("gamma", 1, 999)]);
    got = await getOrganicKeywords(t.db, p.id);
    expect(got.rows.map((r) => r.keyword)).toEqual(["gamma"]);
    expect(got.rows[0]).toMatchObject({ position: 1, searchVolume: 999, url: "https://example-site.com/gamma" });
  });

  it("returns an empty result (not an error) when nothing is stored", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    expect(await getOrganicKeywords(t.db, p.id)).toEqual({ rows: [], capturedAt: null });
  });

  it("replacing with an empty array clears a project's prior rows (synced-to-empty, not never-synced)", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await replaceOrganicKeywords(t.db, p.id, [row("alpha", 3, 100), row("beta", 8, 50)]);
    expect((await getOrganicKeywords(t.db, p.id)).rows).toHaveLength(2);

    await replaceOrganicKeywords(t.db, p.id, []);
    expect(await getOrganicKeywords(t.db, p.id)).toEqual({ rows: [], capturedAt: null });
  });

  it("is scoped per project — replacing project A's keywords leaves project B's rows untouched", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await createProject(t.db, { name: "A", domain: "a.example" });
    const b = await createProject(t.db, { name: "B", domain: "b.example" });

    await replaceOrganicKeywords(t.db, a.id, [row("alpha", 3, 100)]);
    await replaceOrganicKeywords(t.db, b.id, [row("beta", 5, 200)]);

    await replaceOrganicKeywords(t.db, a.id, [row("gamma", 1, 999)]);

    const gotA = await getOrganicKeywords(t.db, a.id);
    const gotB = await getOrganicKeywords(t.db, b.id);
    expect(gotA.rows.map((r) => r.keyword)).toEqual(["gamma"]);
    expect(gotB.rows.map((r) => r.keyword)).toEqual(["beta"]);
  });
});
