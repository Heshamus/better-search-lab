import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/serp-organic-live.json";
import { serpOrganicLive } from "@/lib/dataforseo/serp";
import { DataForSeoClient, DataForSeoError } from "@/lib/dataforseo/client";

describe("serpOrganicLive", () => {
  it("parses organic items and serp features from a real fixture", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    vi.spyOn(client, "post").mockResolvedValue(fixture as any);
    const { items, rows } = await serpOrganicLive(client, {
      keyword: "seo reporting software", locationCode: 2840, languageCode: "en",
    });
    const hf = items.find((i) => i.domain === "example-site.com");
    expect(hf?.rankAbsolute).toBe(12);
    expect(items.some((i) => i.serpFeatures.includes("featured_snippet"))).toBe(true);
    expect(rows).toBeGreaterThan(0);

    // each item gets its own serpFeatures array (no shared-reference aliasing)
    expect(items.length).toBeGreaterThan(1);
    expect(items[0].serpFeatures).not.toBe(items[1].serpFeatures);
  });

  it("throws on a task-level error envelope (e.g. a billing lapse) instead of returning an empty result", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const billingLapseEnvelope = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        { status_code: 40200, status_message: "Payment required.", result: null },
      ],
    };
    vi.spyOn(client, "post").mockResolvedValue(billingLapseEnvelope as any);
    await expect(
      serpOrganicLive(client, { keyword: "seo reporting software", locationCode: 2840, languageCode: "en" })
    ).rejects.toBeInstanceOf(DataForSeoError);
  });

  it("does NOT throw when the task succeeds but our domain is simply absent (genuinely not ranked)", async () => {
    const client = new DataForSeoClient({ login: "L", password: "P" });
    const domainAbsentEnvelope = {
      status_code: 20000,
      status_message: "Ok.",
      tasks: [
        {
          status_code: 20000,
          status_message: "Ok.",
          result: [
            {
              items: [
                { type: "organic", rank_group: 1, rank_absolute: 1, domain: "competitor.com", url: "https://competitor.com/x" },
              ],
            },
          ],
        },
      ],
    };
    vi.spyOn(client, "post").mockResolvedValue(domainAbsentEnvelope as any);
    const { items, rows } = await serpOrganicLive(client, {
      keyword: "seo reporting software", locationCode: 2840, languageCode: "en",
    });
    expect(items.some((i) => i.domain === "example-site.com")).toBe(false);
    expect(rows).toBeGreaterThan(0);
  });
});
