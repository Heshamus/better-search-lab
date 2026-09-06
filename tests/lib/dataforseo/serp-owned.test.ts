import { describe, it, expect } from "vitest";
import { extractOwnedFeatures } from "@/lib/dataforseo/serp";

describe("extractOwnedFeatures", () => {
  it("detects an owned featured snippet (www-insensitive)", () => {
    expect(extractOwnedFeatures([{ type: "featured_snippet", domain: "www.example-site.com" }], "example-site.com")).toContain("featured_snippet");
  });

  it("detects ownership inside an AI overview's references (subdomain-aware)", () => {
    const raw = [{ type: "ai_overview", references: [{ domain: "competitor.com" }, { domain: "blog.example-site.com" }] }];
    expect(extractOwnedFeatures(raw, "example-site.com")).toContain("ai_overview");
  });

  it("detects PAA ownership in an expanded element", () => {
    const raw = [{ type: "people_also_ask", items: [{ expanded_element: [{ domain: "example-site.com" }] }] }];
    expect(extractOwnedFeatures(raw, "example-site.com")).toContain("people_also_ask");
  });

  it("does not claim a feature a competitor owns", () => {
    expect(extractOwnedFeatures([{ type: "featured_snippet", domain: "competitor.com" }], "example-site.com")).toEqual([]);
  });

  it("ignores local_pack (not content-ownable) and returns [] with no domain", () => {
    expect(extractOwnedFeatures([{ type: "local_pack", domain: "example-site.com" }], "example-site.com")).toEqual([]);
    expect(extractOwnedFeatures([{ type: "featured_snippet", domain: "example-site.com" }], "")).toEqual([]);
  });
});
