import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("repository metadata", () => {
  it("ships the AGPL-3.0 license text", () => {
    const text = readFileSync("LICENSE", "utf8");
    expect(text).toMatch(/GNU AFFERO GENERAL PUBLIC LICENSE/);
    expect(text).toMatch(/Version 3, 19 November 2007/);
  });
  it("declares the license and the release version in both packages", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const mcp = JSON.parse(readFileSync("mcp/package.json", "utf8"));
    expect(root.license).toBe("AGPL-3.0-only");
    expect(root.name).toBe("better-search-lab");
    expect(root.version).toBe("1.1.2");
    expect(mcp.license).toBe("AGPL-3.0-only");
    expect(mcp.name).toBe("@better-search-lab/mcp");
    expect(mcp.private).toBeUndefined();
    expect(mcp.bin).toEqual({ "better-search-lab-mcp": "dist/server.js" });
    expect(mcp.files).toEqual(["dist"]);
    expect(mcp.publishConfig).toEqual({ access: "public" });
  });
  it("points the MCP client at localhost by default, not a private host", () => {
    const server = readFileSync("mcp/server.ts", "utf8");
    expect(server).toMatch(/DEFAULT_BSL_URL = "http:\/\/localhost:3000"/);
  });
});
