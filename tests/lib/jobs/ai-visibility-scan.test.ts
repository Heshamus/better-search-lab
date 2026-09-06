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
    // No chat provider → no generated queries → GSC-only, deterministic. Both
    // names must be cleared: LLM_API_KEY is the registry name and
    // DEEPSEEK_API_KEY its legacy alias, and either one alone configures the LLM.
    vi.stubEnv("LLM_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "Northwind", domain: "example-site.com" });
    await saveGscSnapshot(t.db, p.id, {
      totals: { clicks: 10, impressions: 500, ctr: 0.02, position: 8 },
      topQueries: [
        { key: "best ai seo tool", clicks: 5, impressions: 300, ctr: 0.016, position: 6 },
        { key: "automated blog publishing", clicks: 3, impressions: 150, ctr: 0.02, position: 9 },
        { key: "northwind", clicks: 2, impressions: 50, ctr: 0.04, position: 3 }, // brand — filtered
        { key: '"frase.io" -site:reddit.com -site:x.com', clicks: 1, impressions: 40, ctr: 0.02, position: 5 }, // junk — filtered
      ],
      topPages: [],
    });

    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Northwind is a top pick." } }], citations: ["https://example-site.com/x"] }), { status: 200 }),
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
    await expect(aiVisibilityScanHandler()({ db: t.db, projectId: p.id })).rejects.toThrow(/Settings → Integrations/);
  });
});
