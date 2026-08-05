import { describe, it, expect } from "vitest";
import { computeRisingQueries, buildQueryPageMap } from "@/lib/google/gsc";
import type { GscRow } from "@/lib/google/gsc";

const row = (q: string, impressions: number): GscRow => ({ keys: [q], clicks: 0, impressions, ctr: 0, position: 0 });

describe("computeRisingQueries", () => {
  it("ranks by impressions growth (recent - prior), biggest jump first", () => {
    const recent = [row("surging", 300), row("steady", 100), row("brand new", 120)];
    const prior = [row("surging", 50), row("steady", 95)];
    const out = computeRisingQueries(recent, prior, { minRecent: 20, minDelta: 10 });
    expect(out[0]).toMatchObject({ query: "surging", recent: 300, prior: 50, delta: 250 });
    expect(out.find((r) => r.query === "brand new")).toMatchObject({ prior: 0, delta: 120 }); // net-new demand
    expect(out.find((r) => r.query === "steady")).toBeUndefined(); // delta 5 < minDelta
  });

  it("filters thin recent volume, sorts desc, and limits", () => {
    const recent = [row("thin", 10), row("big", 200), row("mid", 150)];
    const out = computeRisingQueries(recent, [], { minRecent: 20, minDelta: 10, limit: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].query).toBe("big");
    expect(out[0].page).toBeNull(); // page is filled by the sync, not here
  });
});

const pq = (query: string, page: string, impressions: number): GscRow => ({ keys: [query, page], clicks: 0, impressions, ctr: 0, position: 0 });

describe("buildQueryPageMap", () => {
  it("maps each query to the page of ours with the most impressions (Google's own mapping)", () => {
    const map = buildQueryPageMap([
      pq("frase alternative", "https://x.io/vs/frase", 80),
      pq("frase alternative", "https://x.io/blog", 20),
      pq("clearscope alternative", "https://x.io/vs/clearscope", 50),
    ]);
    expect(map.get("frase alternative")).toBe("https://x.io/vs/frase"); // highest impressions wins
    expect(map.get("clearscope alternative")).toBe("https://x.io/vs/clearscope");
    expect(map.get("no such query")).toBeUndefined();
  });
});
