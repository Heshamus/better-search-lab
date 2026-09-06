import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The three terms are spelled out from parts so this file does not match itself.
const TERMS = [["harper", "flow"].join(""), ["super", "genius"].join(""), ["betterbrain", "lab"].join("")];
// These two documents describe the scrub itself and legitimately name the terms.
const EXCLUDED = ["docs/superpowers/plans/2026-09-05-m1-part-1-foundation-core.md", "docs/superpowers/specs/2026-09-05-m1-open-source-foundation-design.md"];

describe("no internal references", () => {
  it("none of the internal brand, host or organization names appear in tracked files", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => f && !EXCLUDED.includes(f) && !f.endsWith(".png"));
    const offenders: string[] = [];
    for (const f of files) {
      let text = "";
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      const lower = text.toLowerCase();
      for (const t of TERMS) if (lower.includes(t)) offenders.push(`${f}: ${t}`);
    }
    expect(offenders).toEqual([]);
  });
});
