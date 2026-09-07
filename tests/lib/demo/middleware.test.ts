import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn(async () => new Response("auth-passthrough")));
vi.mock("next-auth", () => ({ default: () => ({ auth: authMock }) }));

import middleware from "@/middleware";

afterEach(() => { vi.unstubAllEnvs(); authMock.mockClear(); });

describe("middleware in demo mode", () => {
  it("refuses a write with the read-only message before auth runs", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const res = (await (middleware as any)(new NextRequest("http://x/api/users", { method: "POST" }), {})) as Response;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "This is a read-only demo." });
    expect(authMock).not.toHaveBeenCalled();
  });
  it("hands allowed requests and pages to Auth.js", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await (middleware as any)(new NextRequest("http://x/api/health"), {});
    await (middleware as any)(new NextRequest("http://x/overview"), {});
    expect(authMock).toHaveBeenCalledTimes(2);
  });
  it("does nothing special outside demo mode", async () => {
    vi.stubEnv("DEMO_MODE", "");
    await (middleware as any)(new NextRequest("http://x/api/users", { method: "POST" }), {});
    expect(authMock).toHaveBeenCalledTimes(1);
  });
});
