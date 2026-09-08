import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("community files", () => {
  it("exist", () => {
    for (const f of ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "CHANGELOG.md", "CLAUDE.md", ".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/feature.yml", ".github/PULL_REQUEST_TEMPLATE.md", "docs/superpowers/README.md"]) expect(existsSync(f), f).toBe(true);
  });
  it("the code of conduct is the Contributor Covenant 2.1 and the changelog follows Keep a Changelog", () => {
    expect(readFileSync("CODE_OF_CONDUCT.md", "utf8")).toMatch(/Contributor Covenant/);
    expect(readFileSync("CODE_OF_CONDUCT.md", "utf8")).toMatch(/version 2\.1/i);
    const log = readFileSync("CHANGELOG.md", "utf8");
    expect(log).toMatch(/keepachangelog\.com/);
    expect(log).toMatch(/## \[1\.0\.0\]/);
  });
  // A `security@….example` address bounces (`.example` is a reserved TLD), so
  // reports go through a GitLab confidential issue, visible only to maintainers.
  it("routes security and conduct reports through a GitLab confidential issue", () => {
    expect(readFileSync("SECURITY.md", "utf8")).toContain("https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issue%5Bconfidential%5D=true");
    for (const f of ["SECURITY.md", "CODE_OF_CONDUCT.md"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/security@/);
    expect(readFileSync("CODE_OF_CONDUCT.md", "utf8")).toMatch(/private reporting link in SECURITY\.md/);
  });
});
