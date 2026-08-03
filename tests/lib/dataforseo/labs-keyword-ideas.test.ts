import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/keyword-ideas-live.json";
import { keywordIdeas } from "@/lib/dataforseo/labs";
import { DataForSeoClient } from "@/lib/dataforseo/client";

describe("keywordIdeas", () => {
  it("parses ideas with volume/cpc/competition/difficulty from a fixture", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(fixture as any);
    const { items, rows } = await keywordIdeas(client, { keywords: ["seo reporting"], locationCode: 2840, languageCode: "en" });
    const hit = items.find((i) => i.keyword === "seo reporting software");
    expect(hit?.searchVolume).toBe(2400);
    expect(hit?.difficulty).toBe(34);
    expect(rows).toBe(items.length);
  });
});
