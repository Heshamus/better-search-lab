import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

describe("release metadata", () => {
  it("both packages are at the same release version with repository metadata", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8"));
    const mcp = JSON.parse(readFileSync("mcp/package.json", "utf8"));
    expect(root.version).toBe("1.0.0");
    expect(mcp.version).toBe("1.0.0");
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
  it("on a v* tag: preflight, a multi-arch image to the GitLab registry, npm publish, a GitLab release", () => {
    expect(ci).toMatch(/\$CI_COMMIT_TAG =~ \/\^v\//);
    expect(job("preflight")).toContain("NPM_TOKEN");
    expect(job("preflight")).toContain("release-notes.md");
    expect(job("image")).toContain("linux/amd64,linux/arm64");
    expect(job("image")).toContain("$CI_REGISTRY_IMAGE");
    expect(job("npm")).toContain("npm publish --access public");
    expect(job("release")).toContain("release-cli");
    for (const j of ["image", "npm", "release"]) expect(job(j), `${j} needs preflight`).toMatch(/needs:[^\n]*preflight/);
  });
});
