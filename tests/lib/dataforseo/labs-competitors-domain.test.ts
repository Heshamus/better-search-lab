import { describe, it, expect, vi } from "vitest";
import fixture from "@/lib/dataforseo/fixtures/competitors-domain-live.json";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { competitorsDomain } from "@/lib/dataforseo/labs";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("competitorsDomain", () => {
  it("parses the fixture into domain/intersections/avgPosition rows", async () => {
    const fetchImpl = vi.fn(async () => ok(fixture));
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl });
    const { items, rows } = await competitorsDomain(client, { target: "example-site.com", locationCode: 2840, languageCode: "en" });
    expect(rows).toBe(items.length);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.domain).toMatch(/\./);
      expect(Number.isInteger(it.intersections)).toBe(true);
      expect(it.avgPosition === null || typeof it.avgPosition === "number").toBe(true);
    }
    const [url, init] = fetchImpl.mock.calls[0] as any;
    expect(String(url)).toBe("https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live");
    expect(JSON.parse(init.body)[0]).toEqual({ target: "example-site.com", location_code: 2840, language_code: "en", limit: 10 });
  });
  it("throws on a task-level error instead of returning an empty list", async () => {
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => ok({ status_code: 20000, tasks: [{ status_code: 40201, status_message: "Insufficient funds", result: null }] })) });
    await expect(competitorsDomain(client, { target: "x.example", locationCode: 2840, languageCode: "en" })).rejects.toThrow(/Insufficient funds/);
  });
});
