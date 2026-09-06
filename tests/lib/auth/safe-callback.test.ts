import { describe, it, expect } from "vitest";
import { safeCallback, DEFAULT_CALLBACK_URL } from "@/lib/auth/safe-callback";

describe("safeCallback", () => {
  it("accepts same-origin app paths, query strings included", () => {
    expect(safeCallback("/rankings")).toBe("/rankings");
    expect(safeCallback("/settings?tab=users&x=1")).toBe("/settings?tab=users&x=1");
  });
  it("falls back to /overview for missing, empty, absolute, protocol-relative, backslash, and API targets", () => {
    for (const raw of [undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "/\\\\evil.com", "\\evil.com", "/api", "/api/projects", "rankings"]) {
      expect(safeCallback(raw)).toBe(DEFAULT_CALLBACK_URL);
    }
  });
  it("reduces an absolute callbackUrl to its path + query (Auth.js stamps the internal origin)", () => {
    expect(safeCallback("http://localhost:3000/overview?x=1")).toBe("/overview?x=1");
    expect(safeCallback("https://evil.com/rankings")).toBe("/rankings");
    expect(safeCallback("https://evil.com/settings?tab=users")).toBe("/settings?tab=users");
  });
  it("still rejects an absolute URL whose path is protocol-relative, an API route, or a non-http scheme", () => {
    expect(safeCallback("http://x//evil.com")).toBe(DEFAULT_CALLBACK_URL);
    expect(safeCallback("http://x/api/y")).toBe(DEFAULT_CALLBACK_URL);
    expect(safeCallback("javascript:alert(1)")).toBe(DEFAULT_CALLBACK_URL);
  });
  it("never resolves off-origin", () => {
    for (const raw of ["/rankings", "/a/b?c=d#e", "/%5Cevil.com"]) {
      const base = "http://bsl.invalid";
      expect(new URL(safeCallback(raw), base).origin).toBe(base);
    }
  });
});
