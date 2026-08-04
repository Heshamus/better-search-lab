import { describe, it, expect, vi } from "vitest";
import { buildAuthUrl } from "@/lib/google/oauth";
import { matchSite, searchAnalytics } from "@/lib/google/gsc";

describe("buildAuthUrl", () => {
  it("builds an offline consent URL with the read-only scope + state", () => {
    const u = new URL(buildAuthUrl({ clientId: "cid", redirectUri: "https://x.io/cb", state: "proj-1" }));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.io/cb");
    expect(u.searchParams.get("scope")).toContain("webmasters.readonly");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("proj-1");
  });
});

describe("matchSite", () => {
  const s = (siteUrl: string) => ({ siteUrl, permissionLevel: "siteOwner" });
  it("prefers a domain property over a URL-prefix", () => {
    expect(matchSite([s("https://harperflow.io/"), s("sc-domain:harperflow.io")], "HarperFlow.io")).toBe("sc-domain:harperflow.io");
  });
  it("falls back to an https prefix (incl www)", () => {
    expect(matchSite([s("https://www.harperflow.io/")], "harperflow.io")).toBe("https://www.harperflow.io/");
  });
  it("returns null when nothing matches", () => {
    expect(matchSite([s("https://other.com/")], "harperflow.io")).toBeNull();
  });
});

describe("searchAnalytics", () => {
  it("POSTs with Bearer auth and maps rows", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ rows: [{ keys: ["2026-08-01"], clicks: 10, impressions: 200, ctr: 0.05, position: 8.4 }] }), { status: 200 }),
    ) as unknown as typeof fetch;

    const rows = await searchAnalytics("tok", "sc-domain:x.io", { startDate: "2026-05-01", endDate: "2026-08-01", dimensions: ["date"] }, fetchImpl);
    expect(rows[0]).toEqual({ keys: ["2026-08-01"], clicks: 10, impressions: 200, ctr: 0.05, position: 8.4 });

    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).toContain("/sites/sc-domain%3Ax.io/searchAnalytics/query");
    expect((init.headers as any).Authorization).toBe("Bearer tok");
  });
});
