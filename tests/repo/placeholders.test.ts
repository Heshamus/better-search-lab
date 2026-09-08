import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Until 2026-09-08 the tree carried release placeholders (an org placeholder
// in angle brackets, a placeholder image name) that a fork substituted before
// tagging. They are gone: the project lives at
// gitlab.com/betterbrainlab/better-search-lab and publishes to the GitLab
// registry. This guard keeps them from creeping back, and keeps the old GitHub
// registry host out too. The needles are assembled from parts, and this file
// is excluded from the scan by name (SELF), so it never matches itself.
const NEEDLES = [["<", "org", ">"].join(""), ["your", "-org"].join(""), ["ghcr", ".io/"].join("")];
const SELF = "tests/repo/placeholders.test.ts";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && f !== SELF && !f.startsWith("docs/superpowers/"));

describe("release placeholders", () => {
  it("no tracked file outside docs/superpowers carries one", () => {
    const offenders: string[] = [];
    for (const f of tracked) {
      let text = "";
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      for (const n of NEEDLES) if (text.includes(n)) offenders.push(`${f}: ${n}`);
    }
    expect(offenders).toEqual([]);
  });
  it("CONTRIBUTING's release section reminds the tagger about the changelog date while it is still a placeholder", () => {
    const contributing = readFileSync("CONTRIBUTING.md", "utf8");
    expect(contributing).toContain("## Releasing");
    if (readFileSync("CHANGELOG.md", "utf8").includes("2026-09-XX")) expect(contributing).toContain("2026-09-XX");
  });
});
