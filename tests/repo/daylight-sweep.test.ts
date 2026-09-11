import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

// git grep with PCRE (-P). On this (BSD) system `-E` silently drops \b and
// lookaheads, so PCRE is mandatory. Returns matching "file:line: text" lines,
// or "" when there are none (git grep exits 1 on no matches → execSync throws).
function grep(pattern: string): string {
  try {
    return execSync(`git grep -nP '${pattern}' -- src`, {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

describe("Daylight — no dark-first remnants (whole app)", () => {
  it("has no color-scheme: dark", () => {
    expect(grep("color-scheme:\\s*dark")).toBe("");
  });
  it("has no dark radial-glow background-image", () => {
    expect(grep("radial-gradient")).toBe("");
  });
  it("has no dark: Tailwind variants (light-only, Ruling 6)", () => {
    expect(grep("\\bdark:")).toBe("");
  });
  it("has no bg-neutral-950 (the old app ground)", () => {
    expect(grep("bg-neutral-950")).toBe("");
  });
  it("has no bare solid bg-accent CTA (bg-accent/NN tints and bg-[--color-accent] data are allowed)", () => {
    expect(grep("bg-accent(?![-/\\w])")).toBe("");
  });
  it("has no accent-coloured input/nav borders (Ruling 7)", () => {
    expect(grep("border-accent\\b")).toBe("");
  });
  it("has no green native-control accent-color", () => {
    expect(grep("accent-\\[var\\(--color-accent\\)\\]")).toBe("");
  });
  it("has no opacity-suffixed at-risk borders (migrated to solid)", () => {
    expect(grep("border-at-risk/")).toBe("");
  });
});
