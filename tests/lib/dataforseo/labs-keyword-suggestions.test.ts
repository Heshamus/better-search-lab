import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/keyword-ideas-live.json";
import { keywordSuggestions } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";

describe("keywordSuggestions", () => {
  it("phrase-matches a single seed and parses volume/kd (same item shape as ideas)", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const post = vi.spyOn(client, "post").mockResolvedValue(fixture as any);

    const { items, rows } = await keywordSuggestions(client, { keyword: "seo reporting", locationCode: 2840, languageCode: "en" });

    // Hits the phrase-match endpoint with a SINGLE `keyword` (not keyword_ideas'
    // broad `keywords` array) — that's what keeps results on-topic.
    expect(post).toHaveBeenCalledWith(
      "/v3/dataforseo_labs/google/keyword_suggestions/live",
      [expect.objectContaining({ keyword: "seo reporting", location_code: 2840, language_code: "en" })],
    );
    const hit = items.find((i) => i.keyword === "seo reporting software");
    expect(hit?.searchVolume).toBe(2400);
    expect(hit?.difficulty).toBe(34);
    expect(rows).toBe(items.length);
  });
});
