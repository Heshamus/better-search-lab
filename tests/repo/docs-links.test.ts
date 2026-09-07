import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function localLinks(md: string): string[] {
  return [...md.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)].map((m) => m[1].replace(/#.*$/, ""));
}

describe("docs", () => {
  it("every relative link in README and docs/ resolves to a file", () => {
    const files = ["README.md", ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => join("docs", f)), ...readdirSync("docs/integrations").map((f) => join("docs/integrations", f)), ...readdirSync("docs/screenshots").map((f) => join("docs/screenshots", f))];
    const missing: string[] = [];
    for (const f of files) {
      const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
      for (const l of localLinks(readFileSync(f, "utf8"))) if (!l.endsWith(".png") && !existsSync(join(dir, l))) missing.push(`${f} → ${l}`);
    }
    expect(missing).toEqual([]);
  });
  it("the README no longer describes the pre-M1 product", () => {
    const readme = readFileSync("README.md", "utf8");
    for (const stale of ["ALLOWLIST", "working name", "Internal, self-hosted", "Phase 0", "seed one manually"]) expect(readme).not.toContain(stale);
    for (const present of ["docker compose up", "/setup", "AGPL", "npx @better-search-lab/mcp", "docs/configuration.md", "DEMO_MODE"]) expect(readme).toContain(present);
  });
});
