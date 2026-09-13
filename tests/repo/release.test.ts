import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("release metadata", () => {
  it("both packages are at the same release version with repository metadata", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const mcp = JSON.parse(readFileSync("mcp/package.json", "utf8"));
    expect(root.version).toBe("1.1.2");
    expect(mcp.version).toBe("1.1.2");
    for (const p of [root, mcp]) {
      expect(p.repository).toMatchObject({ type: "git", url: expect.stringContaining("better-search-lab") });
      expect(p.homepage).toContain("better-search-lab");
      expect(p.bugs?.url).toContain("issues");
      expect(Array.isArray(p.keywords) && p.keywords.includes("seo")).toBe(true);
      expect(p.license).toBe("AGPL-3.0-only");
    }
  });
});

const ci = readFileSync(".gitlab-ci.yml", "utf8");
/** One top-level job's body: from its unindented `name:` line to the next unindented key. */
const job = (name: string): string => ci.match(new RegExp(`\\n${name}:\\n([\\s\\S]*?)(?=\\n[\\w.-]+:\\n|$)`))?.[1] ?? "";

describe("the GitLab pipeline", () => {
  it("is the only pipeline: no GitHub workflow or Dependabot file remains", () => {
    expect(existsSync(".github/workflows")).toBe(false);
    expect(existsSync(".github/dependabot.yml")).toBe(false);
  });
  it("runs every local gate in the test job, with a real Postgres for the concurrency suite", () => {
    const t = job("test");
    for (const cmd of ["pnpm install --frozen-lockfile", "pnpm exec tsc --noEmit", "pnpm docs:config --check", "pnpm exec vitest run", "pnpm build", "npx vitest run && npm run build"]) {
      expect(t, cmd).toContain(cmd);
    }
    expect(t).toContain("postgres:16-alpine");
    expect(t).toContain("TEST_DATABASE_URL: postgres://postgres:postgres@postgres:5432/bsl_test");
  });
  it("boots the demo before anything is published and proves the login and the write refusal", () => {
    const s = job("demo-smoke");
    expect(s).toContain("docker-compose.demo.yml");
    expect(s).toContain("/api/health");
    expect(s).toContain("Explore the demo");
    expect(s).toContain('"403"');
    expect(s).toMatch(/needs:.*test/);
  });
  it("on a v* tag: preflight, a multi-arch image to the GitLab registry, the MCP tarball, a GitLab release", () => {
    expect(ci).toMatch(/\$CI_COMMIT_TAG =~ \/\^v\//);
    expect(job("preflight")).toContain("release-notes.md");
    expect(job("preflight")).not.toContain("NPM_TOKEN");
    expect(job("publish-image")).toContain("linux/amd64,linux/arm64");
    expect(job("publish-image")).toContain("$CI_REGISTRY_IMAGE");
    expect(job("package-mcp")).toContain("npm pack");
    expect(job("package-mcp")).toContain("packages/generic/mcp/");
    expect(job("package-mcp")).toContain("better-search-lab-mcp.tgz");
    expect(job("release")).toContain("glab release create");
    expect(job("release")).toContain("--notes-file release-notes.md");
    expect(job("release")).toContain('\\"direct_asset_path\\":\\"/better-search-lab-mcp.tgz\\"');
    expect(job("release")).toContain("GLAB_ENABLE_CI_AUTOLOGIN");
    for (const j of ["publish-image", "package-mcp", "release"]) expect(job(j), `${j} needs preflight`).toMatch(/needs:[^\n]*preflight/);
  });
  it("never publishes to npm", () => {
    expect(ci).not.toMatch(/npm publish|NPM_TOKEN|registry\.npmjs\.org|release-cli/);
  });
  it("uses no reserved keyword as a job name, and every needs target is a job in this file", () => {
    // GitLab rejects the whole pipeline when a job carries a global keyword's
    // name (`image` was this file's first name for the publish job).
    const RESERVED = ["image", "services", "stages", "types", "before_script", "after_script", "variables", "cache", "include", "default", "workflow", "true", "false", "nil"];
    const jobs = [...ci.matchAll(/^([\w-]+):\n((?:[ \t]+.*\n?)*)/gm)]
      .filter(([, , body]) => /^\s+(script|stage):/m.test(body))
      .map(([, name]) => name);
    expect(jobs).toEqual(["test", "demo-smoke", "preflight", "publish-image", "package-mcp", "release"]);
    for (const j of jobs) expect(RESERVED, `${j} is a reserved keyword`).not.toContain(j);
    for (const [, list] of ci.matchAll(/^\s+needs:\s*\[([^\]]*)\]/gm)) {
      for (const target of list.split(",").map((s) => s.trim())) expect(jobs, `needs target ${target}`).toContain(target);
    }
  });
});
