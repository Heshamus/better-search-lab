import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("release metadata", () => {
  it("both packages are at the same release version with repository metadata", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const mcp = JSON.parse(readFileSync("mcp/package.json", "utf8"));
    expect(root.version).toBe("1.0.0");
    expect(mcp.version).toBe("1.0.0");
    for (const p of [root, mcp]) {
      expect(p.repository).toMatchObject({ type: "git", url: expect.stringContaining("better-search-lab") });
      expect(p.homepage).toContain("better-search-lab");
      expect(p.bugs?.url).toContain("issues");
      expect(Array.isArray(p.keywords) && p.keywords.includes("seo")).toBe(true);
      expect(p.license).toBe("AGPL-3.0-only");
    }
  });
  it("the release workflow builds a multi-arch image, publishes the MCP package, and cuts a GitHub release on tags", () => {
    const y = readFileSync(".github/workflows/release.yml", "utf8");
    expect(y).toMatch(/tags:\s*\n\s*- ["']?v\*/);
    expect(y).toContain("linux/amd64,linux/arm64");
    expect(y).toContain("ghcr.io/");
    expect(y).toContain("npm publish");
    expect(y).toContain("softprops/action-gh-release");
  });
});
