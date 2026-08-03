import { describe, it, expect, vi } from "vitest";
import fx from "@/lib/dataforseo/fixtures/keyword-overview-live.json";
import { keywordOverview } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { estimateCost } from "@/lib/dataforseo/cost";

describe("keywordOverview + cost", () => {
  it("parses overview items", async () => {
    const c = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(c, "post").mockResolvedValue(fx as any);
    const { items } = await keywordOverview(c, { keywords: ["seo reporting software"], locationCode: 2840, languageCode: "en" });
    expect(items[0].searchVolume).toBeGreaterThan(0);
  });
  it("prices the labs endpoints", () => {
    expect(estimateCost("/v3/dataforseo_labs/google/ranked_keywords/live", 100)).toBeCloseTo(0.012, 4);
  });
});
