import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/serp-organic-live.json";
import { serpOrganicLive } from "@/lib/dataforseo/serp";
import { DataForSeoClient } from "@/lib/dataforseo/client";

describe("serpOrganicLive", () => {
  it("parses organic items and serp features from a real fixture", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(fixture as any);
    const { items, rows } = await serpOrganicLive(client, {
      keyword: "seo reporting software", locationCode: 2840, languageCode: "en",
    });
    const hf = items.find((i) => i.domain === "harperflow.io");
    expect(hf?.rankAbsolute).toBe(12);
    expect(items.some((i) => i.serpFeatures.includes("featured_snippet"))).toBe(true);
    expect(rows).toBeGreaterThan(0);
  });
});
