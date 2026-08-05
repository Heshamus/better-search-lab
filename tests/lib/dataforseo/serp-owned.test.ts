import { describe, it, expect } from "vitest";
import { extractOwnedFeatures } from "@/lib/dataforseo/serp";

describe("extractOwnedFeatures", () => {
  it("detects an owned featured snippet (www-insensitive)", () => {
    expect(extractOwnedFeatures([{ type: "featured_snippet", domain: "www.harperflow.io" }], "harperflow.io")).toContain("featured_snippet");
  });

  it("detects ownership inside an AI overview's references (subdomain-aware)", () => {
    const raw = [{ type: "ai_overview", references: [{ domain: "competitor.com" }, { domain: "blog.harperflow.io" }] }];
    expect(extractOwnedFeatures(raw, "harperflow.io")).toContain("ai_overview");
  });

  it("detects PAA ownership in an expanded element", () => {
    const raw = [{ type: "people_also_ask", items: [{ expanded_element: [{ domain: "harperflow.io" }] }] }];
    expect(extractOwnedFeatures(raw, "harperflow.io")).toContain("people_also_ask");
  });

  it("does not claim a feature a competitor owns", () => {
    expect(extractOwnedFeatures([{ type: "featured_snippet", domain: "competitor.com" }], "harperflow.io")).toEqual([]);
  });

  it("ignores local_pack (not content-ownable) and returns [] with no domain", () => {
    expect(extractOwnedFeatures([{ type: "local_pack", domain: "harperflow.io" }], "harperflow.io")).toEqual([]);
    expect(extractOwnedFeatures([{ type: "featured_snippet", domain: "harperflow.io" }], "")).toEqual([]);
  });
});
