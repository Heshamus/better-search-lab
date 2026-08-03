import { describe, it, expect } from "vitest";
import { isBlockedHost, fetchSite } from "@/lib/crawl/fetch-site";

describe("isBlockedHost", () => {
  it("blocks loopback, private, link-local, and non-decimal IP encodings", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.1.1",
                      "0x7f.0.0.1", "0177.0.0.1", "2130706433", "foo.local", "::1"]) {
      expect(isBlockedHost(h)).toBe(true);
    }
  });
  it("allows public hostnames", () => {
    for (const h of ["harperflow.io", "www.example.com", "sub.domain.co.uk"]) {
      expect(isBlockedHost(h)).toBe(false);
    }
  });
});

describe("fetchSite", () => {
  it("refuses a blocked host without fetching", async () => {
    let called = false;
    const fetchImpl = (async () => { called = true; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    const r = await fetchSite("http://127.0.0.1/", { fetchImpl });
    expect(r.failed).toBe(true);
    expect(r.reason).toMatch(/blocked|private/i);
    expect(called).toBe(false);
  });

  it("fetches the homepage then up to maxPages same-host internal links", async () => {
    const home = `<html><head><title>Home</title></head><body>
      <a href="/about">About</a><a href="https://other.com/x">Off-site</a>
      <a href="/pricing">Pricing</a></body></html>`;
    const sub = `<html><head><title>Sub</title></head><body>ok</body></html>`;
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(String(url).includes("harperflow.io/") && calls.length === 1 ? home : sub,
        { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await fetchSite("harperflow.io", { fetchImpl, maxPages: 3 });
    expect(r.failed).toBe(false);
    expect(r.pages.length).toBe(3); // home + about + pricing (off-site skipped)
    expect(calls.every((u) => u.includes("harperflow.io"))).toBe(true);
  });

  it("degrades to failed with a reason when the homepage fetch throws", async () => {
    const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const r = await fetchSite("harperflow.io", { fetchImpl });
    expect(r.failed).toBe(true);
    expect(r.reason).toBeTruthy();
    expect(r.pages).toEqual([]);
  });
});
