import { describe, it, expect } from "vitest";
import { isDemoAllowed } from "@/lib/demo/allowlist";
import { isDemoMode } from "@/lib/demo/mode";

describe("demo allowlist (spec §13)", () => {
  it("passes exactly the listed routes and methods", () => {
    for (const [m, p] of [
      ["POST", "/api/auth/callback/credentials"], ["GET", "/api/auth/session"], ["POST", "/api/auth/signout"],
      ["GET", "/api/health"], ["GET", "/api/selftest"], ["GET", "/api/jobs/abc"], ["GET", "/api/mcp/projects"], ["GET", "/api/mcp/keyword-overview"],
      ["GET", "/api/settings/integrations"], ["HEAD", "/api/health"],
      // The demo UI itself needs these on every page load (site-switcher, rankings) —
      // without them the boundary breaks the app, not just writes to it.
      ["GET", "/api/projects"], ["GET", "/api/keywords/k1/history"],
      // GET, HEAD and OPTIONS are all reads per the plan's Global Constraints.
      ["OPTIONS", "/api/mcp/projects"],
    ] as const) expect(isDemoAllowed(m, p), `${m} ${p}`).toBe(true);
  });
  it("refuses every other API request, any method, including the GET that writes", () => {
    for (const [m, p] of [
      ["GET", "/api/google/callback"], ["GET", "/api/google/connect"], ["POST", "/api/projects"], ["PATCH", "/api/users/u1"], ["DELETE", "/api/mcp-tokens"],
      ["PUT", "/api/settings/integrations"], ["POST", "/api/settings/integrations/dataforseo/test"], ["GET", "/api/settings/integrations/llm/models"],
      ["POST", "/api/jobs/abc"], ["POST", "/api/mcp/projects"], ["GET", "/api/users"], ["POST", "/api/setup/admin"],
      // The two newly-allowed prefixes are GET-only, same as everything else.
      ["POST", "/api/keywords/k1/history"],
    ] as const) expect(isDemoAllowed(m, p), `${m} ${p}`).toBe(false);
  });
  it("never touches non-API paths", () => {
    expect(isDemoAllowed("POST", "/overview")).toBe(true);
    expect(isDemoAllowed("GET", "/login")).toBe(true);
  });
  it("normalizes the method's case", () => {
    expect(isDemoAllowed("post", "/api/users")).toBe(false);
    expect(isDemoAllowed("get", "/api/projects")).toBe(true);
  });
  it("isDemoMode reads DEMO_MODE like the bootstrap schema", () => {
    expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "1" })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });
});
