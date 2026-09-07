import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ resolveSessionUser: vi.fn(async () => ({ id: "u1", email: "a@example.com", role: "member" })) }));
vi.mock("@/lib/config/resolve", () => ({ getConfig: vi.fn(async () => ({ dataforseo: { configured: false } })) }));
vi.mock("@/lib/config/clients", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/clients")>("@/lib/config/clients");
  return { ...actual, makeDataForSeoClient: vi.fn((cfg: any) => (cfg.dataforseo.configured ? ({} as any) : null)) };
});
vi.mock("@/lib/competitor-suggest", () => ({ suggestCompetitors: vi.fn(async () => [{ domain: "fresh.example", intersections: 40, avgPosition: 8 }]) }));

import { getConfig } from "@/lib/config/resolve";
import { resolveSessionUser } from "@/lib/auth/session";
import { POST } from "@/app/api/projects/[id]/competitors/suggest/route";

const post = () => POST(new Request("http://x/api/projects/p1/competitors/suggest", { method: "POST" }) as any, { params: Promise.resolve({ id: "p1" }) });

describe("POST /api/projects/[id]/competitors/suggest", () => {
  it("503s with the not-configured copy when DataForSEO is unset", async () => {
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/DataForSEO is not configured/);
  });
  it("returns suggestions when configured, reading config fresh", async () => {
    (getConfig as any).mockResolvedValueOnce({ dataforseo: { configured: true } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [{ domain: "fresh.example", intersections: 40, avgPosition: 8 }] });
    expect(getConfig).toHaveBeenCalledWith(expect.anything(), { fresh: true });
  });
  it("401s without a session", async () => {
    (resolveSessionUser as any).mockResolvedValueOnce(null);
    expect((await post()).status).toBe(401);
  });
});
