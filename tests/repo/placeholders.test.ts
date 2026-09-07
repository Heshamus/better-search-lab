import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// CONTRIBUTING.md's "Before you tag a release" section lists every file a fork
// has to substitute. A hand-maintained list goes stale the moment someone adds
// a placeholder somewhere new (or removes the last one from a file), and the
// symptom is a published release still pointing at `<org>`. So recompute both
// lists from the tree and compare them with what the section names.
//
// Two files are excluded by construction: this test, which has to spell the
// placeholders out to search for them, and CONTRIBUTING.md, whose whole job in
// that section is to name them.
const SELF = "tests/repo/placeholders.test.ts";
const ORG = ["<", "org", ">"].join("");
const IMAGE = "ghcr.io/your-org/better-search-lab";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f && f !== SELF && f !== "CONTRIBUTING.md" && !f.startsWith("docs/superpowers/"));

const filesContaining = (needle: string): string[] =>
  tracked.filter((f) => readFileSync(f, "utf8").includes(needle));

const section = (() => {
  const doc = readFileSync("CONTRIBUTING.md", "utf8");
  const start = doc.indexOf("## Before you tag a release");
  expect(start, "CONTRIBUTING.md has no 'Before you tag a release' section").toBeGreaterThan(-1);
  const rest = doc.slice(start + 1);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
})();

/** The paths bulleted under `marker`: each bullet opens with a backticked path. */
function bulletedPaths(marker: string): string[] {
  const from = section.indexOf(marker);
  expect(from, `CONTRIBUTING.md's release section has no "${marker}" list`).toBeGreaterThan(-1);
  const out: string[] = [];
  for (const line of section.slice(from).split("\n").slice(1)) {
    const m = /^- `([^`]+)`/.exec(line);
    if (m) out.push(m[1]);
    else if (out.length > 0 && line.trim() !== "") break;
  }
  return out;
}

describe("release placeholders are documented (CONTRIBUTING.md)", () => {
  it("names every tracked file holding the org placeholder, and no other", () => {
    expect(bulletedPaths("Replace the org placeholder").sort()).toEqual(filesContaining(ORG).sort());
  });
  it("names every tracked file holding the published image name, and no other", () => {
    expect(bulletedPaths("Replace the image name").sort()).toEqual(filesContaining(IMAGE).sort());
  });
  it("reminds the tagger to set the changelog's release date", () => {
    // Only while the date is still a placeholder — once it is a real date the
    // reminder has done its job and the changelog assertion below is moot.
    if (readFileSync("CHANGELOG.md", "utf8").includes("2026-09-XX")) expect(section).toContain("2026-09-XX");
  });
});
