import { describe, it, expect, vi } from "vitest";
import { fetchLatestRelease } from "@/lib/lifecycle/gitlab-releases";
import fixture from "@/lib/lifecycle/fixtures/release-latest.json";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("fetchLatestRelease", () => {
  it("parses tag_name into a bare version + a release url", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(fixture));
    const r = await fetchLatestRelease({ fetchImpl });
    expect(r).toEqual({ ok: true, version: "1.1.0", url: "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.1.0" });
    // hits the permalink/latest endpoint on the encoded project path
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/api/v4/projects/betterbrainlab%2Fbetter-search-lab/releases/permalink/latest");
  });
  it("is fail-soft on a non-2xx (no throw, ok:false)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(fetchLatestRelease({ fetchImpl })).resolves.toEqual({ ok: false });
  });
  it("is fail-soft on a network throw (no throw, ok:false)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    await expect(fetchLatestRelease({ fetchImpl })).resolves.toEqual({ ok: false });
  });
  it("is fail-soft on malformed JSON / missing tag_name", async () => {
    await expect(fetchLatestRelease({ fetchImpl: vi.fn().mockResolvedValue(ok({})) })).resolves.toEqual({ ok: false });
  });
});
