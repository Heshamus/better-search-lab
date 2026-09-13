import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { apiUsage } from "@/db/schema";
import { createProject } from "@/lib/projects";
import { addCompetitor } from "@/lib/competitors";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { suggestCompetitors } from "@/lib/competitor-suggest";

let close: () => Promise<void>;
afterEach(() => { close?.(); });

const resp = (domains: string[]) => new Response(JSON.stringify({
  status_code: 20000,
  tasks: [{ status_code: 20000, result: [{ items: domains.map((d, i) => ({ domain: d, avg_position: 10 + i, intersections: 100 - i })) }] }],
}), { status: 200 });

describe("suggestCompetitors", () => {
  it("excludes the project's own domain and already-tracked competitors, and logs usage", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "A", domain: "www.example-site.com" });
    await addCompetitor(t.db, p.id, "tracked.example");
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => resp(["example-site.com", "tracked.example", "fresh.example", "www.other.example"])) });
    const out = await suggestCompetitors(t.db, client, p.id);
    expect(out.map((s) => s.domain)).toEqual(["fresh.example", "other.example"]);
    expect(out[0]).toMatchObject({ intersections: 98, avgPosition: 12 });
    const usage = await t.db.select().from(apiUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0].endpoint).toBe("/v3/dataforseo_labs/google/competitors_domain/live");
  });
  it("drops mega-platforms and over-broad domains, keeping real rivals", async () => {
    const t = await createTestDb(); close = t.close;
    const p = await createProject(t.db, { name: "B", domain: "mysite.example" });
    const items = [
      { domain: "youtube.com", avg_position: 3, intersections: 900 },
      { domain: "reddit.com", avg_position: 5, intersections: 800 },
      { domain: "webflow.com", avg_position: 6, intersections: 600 },
      { domain: "huge.example", avg_position: 6, intersections: 700, full_domain_metrics: { organic: { count: 5_000_000 } } },
      { domain: "rival-one.example", avg_position: 8, intersections: 120, full_domain_metrics: { organic: { count: 4200 } } },
      { domain: "rival-two.example", avg_position: 9, intersections: 90 },
    ];
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl: vi.fn(async () => new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }), { status: 200 })) });
    const out = await suggestCompetitors(t.db, client, p.id);
    expect(out.map((s) => s.domain)).toEqual(["rival-one.example", "rival-two.example"]);
  });
  it("returns [] for an unknown project without calling the API", async () => {
    const t = await createTestDb(); close = t.close;
    const fetchImpl = vi.fn();
    const client = new DataForSeoClient({ login: "l", password: "p", fetchImpl });
    expect(await suggestCompetitors(t.db, client, "00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
