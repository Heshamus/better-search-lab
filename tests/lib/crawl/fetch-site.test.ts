import { describe, it, expect } from "vitest";
import { isBlockedHost, fetchSite } from "@/lib/crawl/fetch-site";

describe("isBlockedHost", () => {
  it("blocks loopback, private, link-local, and non-decimal IP encodings", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.1.1",
                      "0x7f.0.0.1", "0177.0.0.1", "2130706433", "foo.local", "::1",
                      // trailing-dot bypass (FIX 2)
                      "localhost.", "foo.internal.", "127.0.0.1.",
                      // bare hex/octal whole-address tokens + dotted shorthand (FIX 3)
                      "0x7f000001", "017700000001", "127.1", "127.0.1"]) {
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

  it("follows a redirect after re-validating the target host (FIX 1a)", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      if (String(url) === "https://harperflow.io/") {
        return new Response(null, { status: 301, headers: { location: "https://www.harperflow.io/" } });
      }
      return new Response(`<html><head><title>WWW</title></head><body>ok</body></html>`,
        { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await fetchSite("harperflow.io", { fetchImpl, maxPages: 1 });
    expect(r.failed).toBe(false);
    expect(r.pages.length).toBe(1);
    expect(r.pages[0].html).toContain("WWW");
    expect(calls).toEqual(["https://harperflow.io/", "https://www.harperflow.io/"]);
  });

  it("refuses to follow a redirect into a blocked host and never fetches it (FIX 1b)", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      if (String(url) === "https://pub.example/") {
        return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } });
      }
      return new Response("<html><body>metadata-secret</body></html>",
        { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await fetchSite("pub.example", { fetchImpl });
    expect(r.failed).toBe(true);
    expect(r.pages).toEqual([]);
    expect(calls).toEqual(["https://pub.example/"]); // redirect target never fetched
  });

  it("discovers a fragment-suffixed href by stripping the fragment (FIX 4)", async () => {
    const home = `<html><body><a href="/pricing#section2">Pricing</a></body></html>`;
    const sub = `<html><body>ok</body></html>`;
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return new Response(calls.length === 1 ? home : sub,
        { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const r = await fetchSite("harperflow.io", { fetchImpl, maxPages: 2 });
    expect(r.failed).toBe(false);
    expect(r.pages.length).toBe(2);
    expect(calls[1]).toBe("https://harperflow.io/pricing");
  });

  it("maxPages:1 returns exactly the homepage with no internal links followed (FIX 5)", async () => {
    const home = `<html><body><a href="/about">About</a></body></html>`;
    const fetchImpl = (async () => new Response(home,
      { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;

    const r = await fetchSite("harperflow.io", { fetchImpl, maxPages: 1 });
    expect(r.failed).toBe(false);
    expect(r.pages.length).toBe(1);
    expect(r.pages[0].url).toBe("https://harperflow.io/");
  });
});
