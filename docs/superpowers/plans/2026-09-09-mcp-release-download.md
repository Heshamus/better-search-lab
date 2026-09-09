# MCP Server as a Release Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop publishing the MCP server to npmjs; ship it as a tarball attached to each GitLab Release and run it with `npx` from that URL.

**Architecture:** The tag pipeline gains a `package-mcp` job that builds `mcp/`, runs `npm pack`, and uploads `better-search-lab-mcp.tgz` to the project's generic package registry; the `release` job (now `glab release create`, since `release-cli` is deprecated) links that file with `direct_asset_path: /better-search-lab-mcp.tgz`, which gives the stable download URL `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/<tag>/downloads/better-search-lab-mcp.tgz`. Every setup snippet (README, `docs/mcp.md`, `mcp/README.md`, the demo's MCP settings panel) shows the current version's URL, and a guard test ties that version to `package.json` so a release cannot ship stale docs.

**Tech Stack:** GitLab CI (`node:22`, `registry.gitlab.com/gitlab-org/cli:latest`), GitLab generic package registry, `npm pack`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-gitlab-first-distribution-design.md` (rows "MCP package" and "Releases", revised 2026-09-09).

## Global Constraints

- Exact strings: download URL `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v<version>/downloads/better-search-lab-mcp.tgz` where `<version>` is `package.json`'s `version` (currently `1.0.0`); asset file name `better-search-lab-mcp.tgz`; generic package name `mcp`; job names `test`, `demo-smoke`, `preflight`, `publish-image`, `package-mcp`, `release`.
- Nothing publishes to npmjs: no `npm publish`, no `NPM_TOKEN`, no `registry.npmjs.org` anywhere in `.gitlab-ci.yml`. The package keeps its name `@better-search-lab/mcp` (`tests/repo/license.test.ts` and `mcp/server.ts` depend on it).
- `npx` keeps the first version it fetched from a fixed URL, so the docs show the versioned URL, never the `permalink/latest` form as the primary instruction.
- `.gitlab-ci.yml` must parse (`ruby -ryaml -e 'YAML.load_file(".gitlab-ci.yml"); puts "yaml ok"'`), and `tests/repo/release.test.ts`'s reserved-name and `needs` guard must keep passing.
- Every commit keeps `pnpm exec tsc --noEmit`, `pnpm exec vitest run` and `pnpm build` green; `mcp/` is not changed by this plan.
- Conventional commit subjects; every commit body ends with the two attribution trailer lines the session uses (commit with `git commit -F <message file>`).
- In a worktree, the Bash guard refuses compound commands (`&&`, pipes, subshells, heredocs); every verification command is a single plain command.
- No `<org>`, `your-org`, `ghcr.io/` anywhere (placeholder guard); no internal terms (`tests/repo/no-internal-references.test.ts`).

---

### Task 1: The pipeline packs the MCP server and attaches it to the release

**Files:**
- Modify: `.gitlab-ci.yml` (header comment, `preflight`, replace the `npm` job, rewrite `release`), `CONTRIBUTING.md` ("Releasing (maintainers)" section)
- Test: `tests/repo/release.test.ts`

**Interfaces:**
- Consumes: `preflight`'s `release-notes.md` artifact; `publish-image`; `mcp/package.json` scripts (`npm run build`) and `npm pack`'s file name `better-search-lab-mcp-<version>.tgz`.
- Produces: the release asset at `/-/releases/<tag>/downloads/better-search-lab-mcp.tgz` that Task 2's docs and app text point at.

- [ ] **Step 1: Write the failing tests**

In `tests/repo/release.test.ts`, replace the test titled "on a v* tag: preflight, a multi-arch image to the GitLab registry, npm publish, a GitLab release" with:

```ts
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
    expect(job("release")).toContain("direct_asset_path");
    expect(job("release")).toContain("/better-search-lab-mcp.tgz");
    expect(job("release")).toContain("GLAB_ENABLE_CI_AUTOLOGIN");
    for (const j of ["publish-image", "package-mcp", "release"]) expect(job(j), `${j} needs preflight`).toMatch(/needs:[^\n]*preflight/);
  });
  it("never publishes to npm", () => {
    expect(ci).not.toMatch(/npm publish|NPM_TOKEN|registry\.npmjs\.org|release-cli/);
  });
```

In the reserved-name test, change the expected job list to `["test", "demo-smoke", "preflight", "publish-image", "package-mcp", "release"]`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/repo/release.test.ts`
Expected: FAIL — `package-mcp` is not a job; `release` contains `release-cli`; `preflight` contains `NPM_TOKEN`; the job list still has `npm`.

- [ ] **Step 3: Edit `.gitlab-ci.yml`**

Header comment: replace the sentence fragment `npm
# publish of mcp/, and a GitLab Release whose notes are the CHANGELOG section.` (the last two comment lines) with:

```yaml
# the MCP server packed as a tarball in the project's generic package registry,
# and a GitLab Release (created with glab) whose notes are the CHANGELOG section
# and whose one asset is that tarball.
```

`preflight` job: delete the whole `- |` block that checks `NPM_TOKEN` (from `- |` through `echo "NPM_TOKEN is set"`). Keep the version check and the release-notes block.

Replace the entire `npm:` job with:

```yaml
package-mcp:
  stage: release
  extends: .release
  image: node:22
  needs: [preflight]
  timeout: 15m
  script:
    - v="${CI_COMMIT_TAG#v}"
    - cd mcp && npm ci && npx vitest run && npm run build
    - npm pack --pack-destination "$CI_PROJECT_DIR"
    - cd "$CI_PROJECT_DIR"
    - mv better-search-lab-mcp-*.tgz better-search-lab-mcp.tgz
    # The tarball lives in the project's generic package registry (anonymous download on a
    # public project); the release job links it under a stable /-/releases/<tag>/downloads/ path.
    - 'curl --fail-with-body --header "JOB-TOKEN: $CI_JOB_TOKEN" --upload-file better-search-lab-mcp.tgz "$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/generic/mcp/$v/better-search-lab-mcp.tgz"'
  artifacts:
    paths: [better-search-lab-mcp.tgz]
    expire_in: 1 week
```

Replace the entire `release:` job with:

```yaml
release:
  stage: release
  extends: .release
  # glab, the GitLab CLI, replaces the release tool GitLab deprecated in 18.0.
  image: registry.gitlab.com/gitlab-org/cli:latest
  needs: [preflight, publish-image, package-mcp]
  timeout: 10m
  variables:
    GLAB_ENABLE_CI_AUTOLOGIN: "true"
  script:
    - v="${CI_COMMIT_TAG#v}"
    - asset="$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/generic/mcp/$v/better-search-lab-mcp.tgz"
    # direct_asset_path is what makes /-/releases/<tag>/downloads/better-search-lab-mcp.tgz resolve.
    - 'glab release create "$CI_COMMIT_TAG" --name "Better Search Lab $CI_COMMIT_TAG" --notes-file release-notes.md --assets-links "[{\"name\":\"better-search-lab-mcp.tgz\",\"url\":\"$asset\",\"direct_asset_path\":\"/better-search-lab-mcp.tgz\",\"link_type\":\"package\"}]"'
```

- [ ] **Step 4: Update CONTRIBUTING's release checklist**

In "Releasing (maintainers)":

Step 1 becomes:

```markdown
1. Bump `version` in `package.json` and `mcp/package.json` to the same value, then `cd mcp && npm install --package-lock-only` so the lockfile follows. Update the MCP download URL in `README.md`, `docs/mcp.md` and `mcp/README.md` to the new tag (`tests/repo/mcp-distribution.test.ts` pins it to the version). Set the release date and the two link definitions at the bottom of `CHANGELOG.md` (`1.0.0` still ships as `2026-09-XX` until the first tag).
```

Step 4 becomes:

```markdown
4. The tag pipeline runs `preflight` (the tag matches both versions), `publish-image` (multi-arch to `registry.gitlab.com/betterbrainlab/better-search-lab:1.2.3` and `:latest`, plus Docker Hub when configured), `package-mcp` (builds and packs `mcp/`, uploads `better-search-lab-mcp.tgz` to the project's generic package registry), and `release` (a GitLab Release whose notes are the CHANGELOG section for that version, with the tarball linked as `/-/releases/v1.2.3/downloads/better-search-lab-mcp.tgz`). Nothing is published to npm.
```

Replace the "CI variables, under Settings → CI/CD → Variables, **protected and masked**: …" paragraph with:

```markdown
No CI variable is required. `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (protected and masked) optionally add a Docker Hub copy under `DOCKERHUB_NAMESPACE`, which defaults to the username. Protect the `v*` tags (Settings → Repository → Protected tags, create: Maintainers) so only maintainers can start a release; protected variables are exposed only on protected refs, so keep the two together if you add any. Leave "run pipelines for merge requests from forks in the parent project" off.
```

- [ ] **Step 5: Verify and commit**

Run: `ruby -ryaml -e 'YAML.load_file(".gitlab-ci.yml"); puts "yaml ok"'` — `yaml ok`.
Run: `pnpm exec vitest run tests/repo/` — Expected: PASS, every file.
Run: `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build` — green.

```bash
git add .gitlab-ci.yml CONTRIBUTING.md tests/repo/release.test.ts
git commit -F <message file>   # subject: ci(release): pack the MCP server and attach it to the GitLab release instead of publishing to npm
```

---

### Task 2: Every setup snippet points at the release download, and a guard keeps the version current

**Files:**
- Create: `src/lib/release.ts`, `tests/repo/mcp-distribution.test.ts`, `tests/components/demo-mcp-token.test.tsx`
- Modify: `src/components/demo-mcp-token.tsx`, `README.md` (the MCP table row and the snippet), `docs/mcp.md` (intro, snippet, a new "Updating" paragraph), `mcp/README.md` (Install and Register sections), `CHANGELOG.md:18`, `tests/repo/docs-links.test.ts:22`

**Interfaces:**
- Consumes: Task 1's asset path `/-/releases/<tag>/downloads/better-search-lab-mcp.tgz`; `REPO_URL` from `src/lib/demo/links.ts`; `package.json`'s `version` (imported the way `src/app/api/health/route.ts` does).
- Produces: `export const MCP_PACKAGE_URL: string` in `src/lib/release.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/repo/mcp-distribution.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The MCP server is not on npm. It ships as a tarball attached to each GitLab
// Release, and npx runs it from that URL. npx keeps whatever it first fetched
// from a fixed URL, so every snippet names the current version's file — and a
// version bump without a docs update fails here, not on a user's machine.
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
const URL = `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v${version}/downloads/better-search-lab-mcp.tgz`;

describe("the MCP server is distributed as a release download", () => {
  it("every setup snippet points at the current version's release asset", () => {
    for (const f of ["README.md", "docs/mcp.md", "mcp/README.md"]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).toContain(URL);
      expect(text, f).not.toMatch(/"-y",\s*"@better-search-lab\/mcp"/);
      expect(text, f).not.toMatch(/npx @better-search-lab\/mcp/);
    }
  });
  it("the app derives the same URL from its own version", async () => {
    const { MCP_PACKAGE_URL } = await import("@/lib/release");
    expect(MCP_PACKAGE_URL).toBe(URL);
  });
  it("the pipeline links that file under that path", () => {
    const ci = readFileSync(".gitlab-ci.yml", "utf8");
    expect(ci).toContain("direct_asset_path");
    expect(ci).toContain("/better-search-lab-mcp.tgz");
    expect(ci).not.toMatch(/npm publish|NPM_TOKEN|registry\.npmjs\.org/);
  });
});
```

`tests/components/demo-mcp-token.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DemoMcpToken } from "@/components/demo-mcp-token";
import { DEMO_MCP_TOKEN } from "@/lib/demo/public";
import { MCP_PACKAGE_URL } from "@/lib/release";

afterEach(cleanup);

describe("DemoMcpToken", () => {
  it("shows the fixed demo token and the npx command with the release download URL", () => {
    render(<DemoMcpToken />);
    expect(screen.getByText(DEMO_MCP_TOKEN)).toBeInTheDocument();
    expect(screen.getByText(`npx -y ${MCP_PACKAGE_URL}`)).toBeInTheDocument();
  });
});
```

In `tests/repo/docs-links.test.ts` line 22, replace `"npx @better-search-lab/mcp"` in the `present` list with `"better-search-lab-mcp.tgz"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/repo/mcp-distribution.test.ts tests/components/demo-mcp-token.test.tsx tests/repo/docs-links.test.ts`
Expected: FAIL — `@/lib/release` does not exist; the docs still say `npx @better-search-lab/mcp`.

- [ ] **Step 3: The URL module and the demo panel**

`src/lib/release.ts`:

```ts
// Default import + destructure, as src/app/api/health/route.ts does: Next's
// bundler warns about named exports from JSON modules.
import pkg from "../../package.json";
import { REPO_URL } from "@/lib/demo/links";

const { version } = pkg;

/**
 * The MCP server ships as a tarball attached to every GitLab Release; `npx` runs
 * it straight from this URL. Both packages carry the app's version, so the app's
 * own version names the right file. Versioned on purpose: npx keeps whatever it
 * first fetched from a fixed URL, so a "latest" link would pin users to their
 * first download.
 */
export const MCP_PACKAGE_URL = `${REPO_URL}/-/releases/v${version}/downloads/better-search-lab-mcp.tgz`;
```

`src/components/demo-mcp-token.tsx`: import `MCP_PACKAGE_URL` from `@/lib/release` and replace the paragraph with:

```tsx
      <p className="text-xs text-neutral-500">
        Read-only; the demo data is synthetic. Run the MCP server with <code className="font-mono text-neutral-300">{`npx -y ${MCP_PACKAGE_URL}`}</code> and BSL_URL set to this demo.
      </p>
```

- [ ] **Step 4: The docs**

`README.md` — the table row becomes:

```markdown
| **MCP** | One `npx` command runs the bundled MCP server straight from the release download, giving Claude Code (or any MCP client) read-only tools over your data |
```

and the snippet becomes:

```json
{ "mcpServers": { "better-search-lab": { "command": "npx", "args": ["-y", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz"], "env": { "BSL_URL": "https://your-install.example.com", "BSL_TOKEN": "bsl_…" } } } }
```

`docs/mcp.md` — the first paragraph becomes:

```markdown
`@better-search-lab/mcp` is a stdio MCP server that exposes your install's read-only `/api/mcp/*` routes to any MCP client (Claude Code, Claude Desktop, Cursor, …). It never writes. It is not on npm: every release attaches it as a tarball, and `npx` downloads and runs it from that URL, so nothing is installed globally and no account is involved.
```

Its snippet's `args` become `["-y", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz"]`. After the `BSL_URL` defaults line, add:

```markdown
## Updating

Each release has its own URL, and `npx` keeps whatever it first fetched from a given URL. To move to a new version, change the version in the URL (the [releases page](https://gitlab.com/betterbrainlab/better-search-lab/-/releases) lists them). The permanent link `https://gitlab.com/betterbrainlab/better-search-lab/-/releases/permalink/latest/downloads/better-search-lab-mcp.tgz` always points at the newest release, but because of that caching it only helps a first-time download.
```

`mcp/README.md` — the Install section becomes:

```markdown
## Install

No clone and no npm account needed: every release attaches the built package, and `npx` runs it from that URL.

    npx -y https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz

(or `npm i -g` that URL and run `better-search-lab-mcp`). To develop against this repo instead: `cd mcp && npm i && npm run build`, then run `node dist/server.js`.
```

and its "Register with a coding agent" snippet's `args` become `["-y", "https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz"]`.

`CHANGELOG.md` line 18 becomes:

```markdown
- The MCP server (`@better-search-lab/mcp`), attached to every release as a tarball that `npx` runs from its URL.
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm exec vitest run tests/repo/ tests/components/demo-mcp-token.test.tsx` — PASS.
Run: `git grep -n "npx @better-search-lab/mcp" -- . ":!docs/superpowers"` — no output.
Run: `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build` — green.

```bash
git add src/lib/release.ts src/components/demo-mcp-token.tsx README.md docs/mcp.md mcp/README.md CHANGELOG.md tests/repo/mcp-distribution.test.ts tests/components/demo-mcp-token.test.tsx tests/repo/docs-links.test.ts
git commit -F <message file>   # subject: docs(mcp): run the MCP server from the release download; pin the URL to the version
```

---

## Done criteria

1. `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build` green; `.gitlab-ci.yml` parses.
2. `git grep -n -e "npm publish" -e NPM_TOKEN -e "npx @better-search-lab/mcp" -- . ":!docs/superpowers"` prints nothing.
3. Owner steps: unchanged from the previous plan except that no npm account or `NPM_TOKEN` is needed; after the first tag, confirm anonymously that `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0/downloads/better-search-lab-mcp.tgz` downloads the file and that `npx -y <that URL>` starts the server.
