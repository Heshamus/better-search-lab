import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { saveScan, getLatestScan, getScanHistory } from "@/lib/ai-visibility/store";
import type { AiVisibilitySnapshotData } from "@/lib/ai-visibility/types";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const mk = (cited: number): AiVisibilitySnapshotData => ({
  queries: [{ text: "best ai seo tool", source: "gsc" }],
  perEngine: [{ engine: "perplexity", answers: 3, named: 1, cited }],
  perQuery: [{ text: "best ai seo tool", source: "gsc", named: true, cited: cited > 0 }],
  namedTotal: 1,
  citedTotal: cited,
  answersTotal: 3,
  citedSources: [{ domain: "rival.com", count: 2, topUrl: "https://rival.com/x" }],
});

describe("ai-visibility store", () => {
  it("appends scans, returns the latest, and history newest-first", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveScan(t.db, p.id, mk(1));
    await saveScan(t.db, p.id, mk(2));

    const latest = await getLatestScan(t.db, p.id);
    expect(latest?.citedTotal).toBe(2);
    expect(latest?.engines[0].engine).toBe("perplexity");
    expect(latest?.citedSources[0].domain).toBe("rival.com");

    const history = await getScanHistory(t.db, p.id, 10);
    expect(history.length).toBe(2);
    expect(history.map((h) => h.citedTotal)).toEqual([2, 1]); // newest first
  });

  it("returns null / empty for a project that never scanned", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "x.io" });
    expect(await getLatestScan(t.db, p.id)).toBeNull();
    expect(await getScanHistory(t.db, p.id)).toEqual([]);
  });
});
