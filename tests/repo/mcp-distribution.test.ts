import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The MCP server is not on npm. It ships as a tarball attached to each GitLab
// Release, and npx runs it from that URL. npx keeps whatever it first fetched
// from a fixed URL, so every snippet names the current version's file — and a
// version bump without a docs update fails here, not on a user's machine.
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
const URL = `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v${version}/downloads/better-search-lab-mcp.tgz`;

describe("the MCP server is distributed as a release download", () => {
  it("every setup snippet points at the current version's release asset", () => {
    for (const f of ["README.md", "docs/mcp.md", "mcp/README.md"]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).toContain(URL);
      expect(text, f).not.toMatch(/"-y",\s*"@better-search-lab\/mcp"/);
      expect(text, f).not.toMatch(/npx @better-search-lab\/mcp/);
    }
  });
  it("the app derives the same URL from its own version", async () => {
    const { MCP_PACKAGE_URL } = await import("@/lib/release");
    expect(MCP_PACKAGE_URL).toBe(URL);
  });
  it("the pipeline links that file under that path", () => {
    const ci = readFileSync(".gitlab-ci.yml", "utf8");
    expect(ci).toContain("direct_asset_path");
    expect(ci).toContain("/better-search-lab-mcp.tgz");
    expect(ci).not.toMatch(/npm publish|NPM_TOKEN|registry\.npmjs\.org/);
  });
});
