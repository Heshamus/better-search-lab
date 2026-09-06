import { describe, it, expect } from "vitest";
import { runScan } from "@/lib/ai-visibility/scan";
import type { EngineId } from "@/lib/ai-visibility/types";

describe("runScan", () => {
  it("aggregates per-engine tallies, totals, and cited sources", async () => {
    const queries = [
      { text: "q1", source: "gsc" as const },
      { text: "q2", source: "generated" as const },
    ];
    const engines = [
      { id: "perplexity" as EngineId, model: "m1" },
      { id: "chatgpt" as EngineId, model: "m2" },
    ];
    const prospect = { name: "Northwind", domain: "example-site.com" };
    // Only perplexity on q1 names + cites the prospect; every answer cites rival.com.
    const ask = async (model: string, prompt: string) => {
      if (model === "m1" && prompt === "q1") {
        return { answer: "Northwind is great", citations: ["https://example-site.com/a", "https://rival.com/b"] };
      }
      return { answer: "some other tools", citations: ["https://rival.com/c"] };
    };

    const out = await runScan({ queries, engines, prospect, ask });
    expect(out.answersTotal).toBe(4);
    expect(out.citedTotal).toBe(1);
    expect(out.namedTotal).toBe(1);
    const pplx = out.perEngine.find((e) => e.engine === "perplexity")!;
    expect(pplx).toMatchObject({ answers: 2, cited: 1, named: 1 });
    expect(out.citedSources[0]).toMatchObject({ domain: "rival.com", count: 4 });
    expect(out.citedSources.find((s) => s.domain === "example-site.com")?.count).toBe(1);
    expect(out.queries).toEqual(queries);
    // per-query: q1 is named+cited (perplexity), q2 is neither
    expect(out.perQuery.find((q) => q.text === "q1")).toMatchObject({ named: true, cited: true, source: "gsc" });
    expect(out.perQuery.find((q) => q.text === "q2")).toMatchObject({ named: false, cited: false, source: "generated" });
  });

  it("counts a failed engine call as zero answers, never throwing", async () => {
    const out = await runScan({
      queries: [{ text: "q1", source: "gsc" }],
      engines: [{ id: "perplexity" as EngineId, model: "m1" }],
      prospect: { name: "X", domain: "x.io" },
      ask: async () => {
        throw new Error("boom");
      },
    });
    expect(out.answersTotal).toBe(0);
    expect(out.citedSources).toEqual([]);
  });
});
