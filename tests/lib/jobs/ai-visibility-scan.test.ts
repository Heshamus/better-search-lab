import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveGscSnapshot } from "@/lib/google/store";
import { aiVisibilityScanHandler } from "@/lib/jobs/handlers/ai-visibility-scan";
import { getLatestScan } from "@/lib/ai-visibility/store";

let close: (() => Promise<void>) | undefined;
afterEach(() => {
  close?.();
  vi.unstubAllEnvs();
});

describe("aiVisibilityScanHandler", () => {
  it("reads GSC queries, scans via Eden, and saves a snapshot", async () => {
    vi.stubEnv("EDENAI_API_KEY", "test-key");
    vi.stubEnv("DEEPSEEK_API_KEY", ""); // no generated queries → GSC-only, deterministic
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HarperFlow", domain: "harperflow.io" });
    await saveGscSnapshot(t.db, p.id, {
      totals: { clicks: 10, impressions: 500, ctr: 0.02, position: 8 },
      topQueries: [
        { key: "best ai seo tool", clicks: 5, impressions: 300, ctr: 0.016, position: 6 },
        { key: "automated blog publishing", clicks: 3, impressions: 150, ctr: 0.02, position: 9 },
        { key: "harperflow", clicks: 2, impressions: 50, ctr: 0.04, position: 3 }, // brand — must be filtered
      ],
      topPages: [],
    });

    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "HarperFlow is a top pick." } }], citations: ["https://harperflow.io/x"] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const out = await aiVisibilityScanHandler({ fetchImpl })({ db: t.db, projectId: p.id });
    // 2 non-brand GSC queries x 3 engines = 6 answers
    expect(out.rows).toBe(6);
    expect(out.cost).toBeGreaterThan(0);

    const latest = await getLatestScan(t.db, p.id);
    expect(latest?.answersTotal).toBe(6);
    expect(latest?.citedTotal).toBe(6); // every mocked answer cites the domain
    expect(latest?.queries.length).toBe(2); // brand query filtered out
  });

  it("throws a clear error when EDENAI_API_KEY is absent", async () => {
    vi.stubEnv("EDENAI_API_KEY", "");
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "X", domain: "x.io" });
    await expect(aiVisibilityScanHandler()({ db: t.db, projectId: p.id })).rejects.toThrow(/configured/);
  });
});
