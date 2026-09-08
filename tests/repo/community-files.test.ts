import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

describe("community files", () => {
  it("exist", () => {
    for (const f of [
      "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "CHANGELOG.md", "CLAUDE.md", "docs/superpowers/README.md",
      ".gitlab/issue_templates/Bug.md", ".gitlab/issue_templates/Feature.md", ".gitlab/merge_request_templates/Default.md",
      ".github/ISSUE_TEMPLATE/config.yml", ".github/PULL_REQUEST_TEMPLATE.md",
    ]) expect(existsSync(f), f).toBe(true);
  });
  // GitHub only mirrors the repository. Its folder must send people to GitLab
  // and must not carry anything that would run or accept work there.
  it("the GitHub folder only redirects to GitLab, and the docs speak of merge requests", () => {
    const cfg = readFileSync(".github/ISSUE_TEMPLATE/config.yml", "utf8");
    expect(cfg).toMatch(/blank_issues_enabled:\s*false/);
    for (const url of cfg.match(/url:\s*(\S+)/g) ?? []) expect(url).toContain("gitlab.com/betterbrainlab/better-search-lab");
    expect(cfg).toContain("issue%5Bconfidential%5D=true");
    expect(readFileSync(".github/PULL_REQUEST_TEMPLATE.md", "utf8")).toMatch(/mirror/i);
    for (const gone of [".github/ISSUE_TEMPLATE/bug.yml", ".github/ISSUE_TEMPLATE/feature.yml", ".github/workflows"]) expect(existsSync(gone), gone).toBe(false);
    expect(execFileSync("git", ["ls-files", ".github"], { encoding: "utf8" }).trim().split("\n").sort()).toEqual([".github/ISSUE_TEMPLATE/config.yml", ".github/PULL_REQUEST_TEMPLATE.md"]);
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("https://github.com/Heshamus/better-search-lab");
    expect(readme).not.toMatch(/pull request/i);
    expect(readFileSync("CONTRIBUTING.md", "utf8")).not.toMatch(/pull request/i);
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
