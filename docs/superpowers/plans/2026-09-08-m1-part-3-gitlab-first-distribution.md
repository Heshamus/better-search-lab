# GitLab-First Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the release plumbing from GitHub to GitLab (CI, registry, releases), turn the GitHub repository into a redirect-only mirror, substitute the real organisation and image names everywhere, and add a one-command installer.

**Architecture:** One `.gitlab-ci.yml` carries the gates (test stage), a demo boot from a locally built image (smoke stage), and the tag-triggered release (preflight → image → npm → release). The image name derives from `CI_REGISTRY_IMAGE` and the compose files read `BSL_IMAGE`, so forks need no edits. `install.sh` at the repo root downloads a compose file from the GitLab raw URL, generates the secret, starts the stack and waits for `/api/health`; CI runs that same script against the locally built image before anything is published. The tree keeps a `.github/` folder whose only job is to send GitHub visitors to GitLab.

**Tech Stack:** GitLab CI (node:22, docker:27 + docker:27-dind, release-cli), docker buildx, npm provenance via GitLab ID tokens, POSIX sh, Vitest repo-guard tests.

**Spec:** `docs/superpowers/specs/2026-09-08-gitlab-first-distribution-design.md` (this plan argues from it; the M1 spec `docs/superpowers/specs/2026-09-05-m1-open-source-foundation-design.md` still governs everything else).

## Global Constraints

- Exact names, used verbatim: repository `https://gitlab.com/betterbrainlab/better-search-lab`; GitHub mirror `https://github.com/Heshamus/better-search-lab`; image `registry.gitlab.com/betterbrainlab/better-search-lab` (tags `<version>` and `latest`); npm package `@better-search-lab/mcp` (unchanged); raw file base `https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main`; confidential-issue link `https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issue%5Bconfidential%5D=true` (the brackets stay percent-encoded so the link survives YAML and Markdown).
- After Task 2 no tracked file outside `docs/superpowers/` contains `<org>`, `your-org` or `ghcr.io/`; the guard test enforces it. `betterbrainlab` is public: the commit that added this plan already removed it from the internal-names blocklist, and the three remaining terms stay blocked (`tests/repo/no-internal-references.test.ts`; do not touch it).
- Issues, merge requests, CI, releases and the registry live on GitLab. The `.github/` folder contains only `ISSUE_TEMPLATE/config.yml` (blank issues disabled, contact links to GitLab) and `PULL_REQUEST_TEMPLATE.md` (mirror notice). No GitHub workflow file exists.
- Every commit keeps `pnpm exec tsc --noEmit`, `pnpm exec vitest run` and `pnpm build` green; `cd mcp && npx vitest run` when `mcp/` changes. Validate `.gitlab-ci.yml` locally with `ruby -ryaml -e 'YAML.load_file(".gitlab-ci.yml"); puts "yaml ok"'` after every edit (Ruby ships with macOS).
- `install.sh` is POSIX sh with `set -eu`, passes `sh -n install.sh`, works when piped (`curl … | sh`, so it never reads `$0` as a file), and honours the overrides `BSL_DIR`, `BSL_REF`, `BSL_IMAGE`, `BSL_COMPOSE_FILE`, `BSL_PULL`, `BSL_HEALTH_URL`.
- Conventional commit subjects. Every commit body ends with the two attribution trailer lines the session uses.
- Docs stay honest: nothing describes a step that does not exist yet (no Docker Hub URL until the owner enables it; the docs say "when configured").
- In a worktree, the Bash guard refuses compound commands (`&&`, pipes, subshells). Every verification command below is a single plain command for that reason; keep it that way.

---

### Task 1: The GitLab pipeline replaces the GitHub workflows

**Files:**
- Create: `.gitlab-ci.yml`
- Delete: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`
- Modify: `tests/postgres/users-concurrency.test.ts:11` (a comment naming the CI file), `CONTRIBUTING.md:48,56` (two bullets naming files that stop carrying the placeholder)
- Test: `tests/repo/release.test.ts` (rewrite the two workflow tests)

**Interfaces:**
- Consumes: the repo's existing scripts (`pnpm docs:config --check`, `pnpm exec vitest run`, `pnpm build`, `cd mcp && npm ci && npx vitest run && npm run build`), `docker-compose.demo.yml` (which still has `build: .`), `CHANGELOG.md` section headings `## [x.y.z]`.
- Produces: jobs named exactly `test`, `demo-smoke`, `preflight`, `image`, `npm`, `release`; the `preflight` job's artifact `release-notes.md`; the image is published as `$CI_REGISTRY_IMAGE:<version>` and `:latest` (Task 2 writes that name into the compose files; Task 4 makes `demo-smoke` run the installer).

- [ ] **Step 1: Write the failing tests**

Replace `tests/repo/release.test.ts` in full:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/repo/release.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open '.gitlab-ci.yml'`.

- [ ] **Step 3: Create `.gitlab-ci.yml`**

```yaml
# GitLab CI for Better Search Lab.
#
# Merge requests and main run the same gates as the local checklist (typecheck,
# generated docs current, the pglite suite plus the real-Postgres suite, a build
# with an empty environment, the MCP package), then boot the read-only demo from
# a locally built image. Tags matching v* add the release: preflight, a
# multi-arch image to the GitLab registry (and Docker Hub when configured), npm
# publish of mcp/, and a GitLab Release whose notes are the CHANGELOG section.
stages: [test, smoke, release]

variables:
  PNPM_VERSION: "10.32.1"
  # docker-in-docker with TLS, the gitlab.com shared-runner default.
  DOCKER_TLS_CERTDIR: "/certs"

workflow:
  rules:
    - if: $CI_COMMIT_TAG =~ /^v/
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

.node:
  image: node:22
  before_script:
    - corepack enable
    - corepack prepare "pnpm@${PNPM_VERSION}" --activate
    - pnpm config set store-dir "$CI_PROJECT_DIR/.pnpm-store"
  cache:
    key:
      files: [pnpm-lock.yaml]
    paths: [.pnpm-store]

.docker:
  image: docker:27
  services:
    - name: docker:27-dind
      alias: docker
  variables:
    DOCKER_HOST: tcp://docker:2376
    DOCKER_TLS_VERIFY: "1"
    DOCKER_CERT_PATH: /certs/client

.release:
  rules:
    - if: $CI_COMMIT_TAG =~ /^v/

test:
  stage: test
  extends: .node
  timeout: 30m
  services:
    - name: postgres:16-alpine
      alias: postgres
  variables:
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: bsl_test
    TEST_DATABASE_URL: postgres://postgres:postgres@postgres:5432/bsl_test
    NEXT_TELEMETRY_DISABLED: "1"
  script:
    - pnpm install --frozen-lockfile
    - pnpm exec tsc --noEmit
    - pnpm docs:config --check
    - pnpm exec vitest run
    # env -i proves the build needs no secret. PATH and HOME come back in because
    # corepack's pnpm shim and the Next telemetry notice both need them.
    - env -i PATH="$PATH" HOME="$HOME" NEXT_TELEMETRY_DISABLED=1 pnpm build
    - cd mcp && npm ci && npx vitest run && npm run build

# The image build lives here rather than in `test` because this job has Docker.
demo-smoke:
  stage: smoke
  extends: .docker
  needs: [test]
  timeout: 30m
  before_script:
    - apk add --no-cache curl
  script:
    - docker compose -f docker-compose.demo.yml up -d --build
    # Ports published inside docker-in-docker are reachable on the service's
    # hostname ("docker"), not on localhost.
    - |
      for i in $(seq 1 60); do
        curl -fsS http://docker:3000/api/health | grep -q '"ok":true' && break
        sleep 5
      done
      curl -fsS http://docker:3000/api/health | grep -q '"ok":true'
    - curl -fsS http://docker:3000/login | grep -q "Explore the demo"
    - test "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://docker:3000/api/users)" = "403"
  after_script:
    - docker compose -f docker-compose.demo.yml logs --no-color --tail=50 web || true
    - docker compose -f docker-compose.demo.yml down -v || true

preflight:
  stage: release
  extends: .release
  image: node:22
  timeout: 5m
  script:
    - v="${CI_COMMIT_TAG#v}"
    - root_v="$(node -p "require('./package.json').version")"
    - mcp_v="$(node -p "require('./mcp/package.json').version")"
    - |
      if [ "$v" != "$root_v" ] || [ "$v" != "$mcp_v" ]; then
        echo "release tag $CI_COMMIT_TAG (version $v) does not match package.json ($root_v) and/or mcp/package.json ($mcp_v)"
        exit 1
      fi
      echo "tag $CI_COMMIT_TAG matches package.json and mcp/package.json"
    - |
      if [ -z "${NPM_TOKEN:-}" ]; then
        echo "NPM_TOKEN is not set. Add it under Settings → CI/CD → Variables (masked) before pushing a release tag, or the npm job fails after the image is already published."
        exit 1
      fi
      echo "NPM_TOKEN is set"
    # The release notes are this version's CHANGELOG section; the release job reads the artifact.
    - |
      awk -v v="$v" '$0 ~ "^## \\[" v "\\]" {p=1; next} /^## \[/ {p=0} p' CHANGELOG.md > release-notes.md
      test -s release-notes.md || echo "See CHANGELOG.md" > release-notes.md
  artifacts:
    paths: [release-notes.md]
    expire_in: 1 week

image:
  stage: release
  extends: [.docker, .release]
  needs: [preflight]
  timeout: 60m
  script:
    - v="${CI_COMMIT_TAG#v}"
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
    - tags="-t $CI_REGISTRY_IMAGE:$v -t $CI_REGISTRY_IMAGE:latest"
    - |
      if [ -n "${DOCKERHUB_USERNAME:-}" ] && [ -n "${DOCKERHUB_TOKEN:-}" ]; then
        echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
        hub="${DOCKERHUB_NAMESPACE:-$DOCKERHUB_USERNAME}/better-search-lab"
        tags="$tags -t $hub:$v -t $hub:latest"
        echo "also publishing to Docker Hub as $hub"
      else
        echo "DOCKERHUB_USERNAME/DOCKERHUB_TOKEN not set: publishing to the GitLab registry only"
      fi
    - docker run --privileged --rm tonistiigi/binfmt --install arm64
    - docker buildx create --use --name bsl-builder
    - docker buildx build --platform linux/amd64,linux/arm64 --push $tags .

npm:
  stage: release
  extends: .release
  image: node:22
  needs: [preflight]
  timeout: 15m
  # npm provenance accepts GitLab CI/CD as a trusted builder through this OIDC token.
  id_tokens:
    SIGSTORE_ID_TOKEN:
      aud: sigstore
  script:
    - cd mcp && npm ci && npx vitest run && npm run build
    - echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$HOME/.npmrc"
    - npm publish --access public --provenance

release:
  stage: release
  extends: .release
  image: registry.gitlab.com/gitlab-org/release-cli:latest
  needs: [preflight, image, npm]
  timeout: 10m
  script:
    - release-cli create --name "Better Search Lab $CI_COMMIT_TAG" --tag-name "$CI_COMMIT_TAG" --description "$(cat release-notes.md)"
```

- [ ] **Step 4: Delete the GitHub workflows and Dependabot, fix the two references**

```bash
git rm .github/workflows/ci.yml .github/workflows/release.yml .github/dependabot.yml
```

In `tests/postgres/users-concurrency.test.ts` line 11, change `(see .github/workflows/ci.yml)` to `(the test job in .gitlab-ci.yml)`.

In `CONTRIBUTING.md`, delete these two bullets from the "Before you tag a release" section (the files no longer exist or no longer carry the placeholder, and `tests/repo/placeholders.test.ts` compares that list with the tree):

```markdown
- `.github/workflows/release.yml` — the GHCR image the release workflow builds and pushes.
- `tests/repo/release.test.ts` — the assertion pinning the release workflow's image name; it has to keep matching the workflow.
```

- [ ] **Step 5: Validate the YAML and run the tests**

Run: `ruby -ryaml -e 'YAML.load_file(".gitlab-ci.yml"); puts "yaml ok"'` — Expected: `yaml ok`.
Run: `pnpm exec vitest run tests/repo/` — Expected: PASS, every file (the placeholder guard is green again thanks to the two deleted bullets).
Run: `pnpm exec vitest run` — Expected: PASS. Run: `pnpm exec tsc --noEmit` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add .gitlab-ci.yml tests/repo/release.test.ts tests/postgres/users-concurrency.test.ts CONTRIBUTING.md
git commit -m "ci: GitLab pipeline with test, demo smoke and tag release replaces the GitHub workflows"
```

(The deletions are already staged by `git rm`.)

---

### Task 2: Real names everywhere, and the guard tests that keep them honest

**Files:**
- Modify: `package.json:19-21`, `mcp/package.json:7-9`, `src/lib/demo/links.ts`, `CHANGELOG.md:26-27`, `SECURITY.md:3`, `docker-compose.yml:20,40`, `docker-compose.demo.yml:18`, `README.md:12`, `docs/install.md:8`, `.github/ISSUE_TEMPLATE/config.yml:4`, `CONTRIBUTING.md` (the whole "Before you tag a release" section)
- Test: `tests/repo/placeholders.test.ts` (rewrite), `tests/repo/community-files.test.ts` (the security test)

**Interfaces:**
- Consumes: the job names from Task 1 for the CONTRIBUTING text (`preflight`, `image`, `npm`, `release`) and the CI variables it reads (`NPM_TOKEN`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, optional `DOCKERHUB_NAMESPACE`).
- Produces: the compose image expression `${BSL_IMAGE:-registry.gitlab.com/betterbrainlab/better-search-lab:latest}` that Task 4's installer and smoke job rely on; `REPO_URL` pointing at GitLab (the demo banner reads it); the confidential-issue URL that Task 3's GitHub redirect reuses.

- [ ] **Step 1: Write the failing tests**

Replace `tests/repo/placeholders.test.ts` in full:

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Until 2026-09-08 the tree carried release placeholders (`<org>`, the image
// name) that a fork substituted before tagging. They are gone: the project
// lives at gitlab.com/betterbrainlab/better-search-lab and publishes to the
// GitLab registry. This guard keeps them from creeping back, and keeps the old
// GitHub registry name out too. Spelled from parts so this file never matches.
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
```

In `tests/repo/community-files.test.ts`, replace the comment and the last test (titled "routes security and conduct reports through GitHub private reporting") with:

```ts
  // A `security@….example` address bounces (`.example` is a reserved TLD), so
  // reports go through a GitLab confidential issue, visible only to maintainers.
  it("routes security and conduct reports through a GitLab confidential issue", () => {
    expect(readFileSync("SECURITY.md", "utf8")).toContain("https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issue%5Bconfidential%5D=true");
    for (const f of ["SECURITY.md", "CODE_OF_CONDUCT.md"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/security@/);
    expect(readFileSync("CODE_OF_CONDUCT.md", "utf8")).toMatch(/private reporting link in SECURITY\.md/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/repo/placeholders.test.ts tests/repo/community-files.test.ts`
Expected: FAIL — the placeholder guard lists `.github/ISSUE_TEMPLATE/config.yml`, `CHANGELOG.md`, `CONTRIBUTING.md`, `README.md`, `SECURITY.md`, `docker-compose.demo.yml`, `docker-compose.yml`, `docs/install.md`, `mcp/package.json`, `package.json`, `src/lib/demo/links.ts`; the security test fails on the missing GitLab URL.

- [ ] **Step 3: Substitute the names**

`package.json` lines 19–21:

```json
  "repository": { "type": "git", "url": "git+https://gitlab.com/betterbrainlab/better-search-lab.git" },
  "homepage": "https://gitlab.com/betterbrainlab/better-search-lab",
  "bugs": { "url": "https://gitlab.com/betterbrainlab/better-search-lab/-/issues" },
```

`mcp/package.json` lines 7–9:

```json
  "repository": { "type": "git", "url": "git+https://gitlab.com/betterbrainlab/better-search-lab.git" },
  "homepage": "https://gitlab.com/betterbrainlab/better-search-lab/-/tree/main/mcp",
  "bugs": { "url": "https://gitlab.com/betterbrainlab/better-search-lab/-/issues" },
```

`src/lib/demo/links.ts`, whole file:

```ts
/** Public home of the project: the canonical GitLab repository. The demo banner links here. */
export const REPO_URL = "https://gitlab.com/betterbrainlab/better-search-lab";
```

`CHANGELOG.md`, the last two lines:

```markdown
[Unreleased]: https://gitlab.com/betterbrainlab/better-search-lab/-/compare/v1.0.0...main
[1.0.0]: https://gitlab.com/betterbrainlab/better-search-lab/-/releases/v1.0.0
```

`SECURITY.md` line 3 (the paragraph that begins "Please report vulnerabilities privately through GitHub") becomes:

```markdown
Please report vulnerabilities privately by [opening a confidential issue](https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issue%5Bconfidential%5D=true) — confidential issues are visible only to maintainers. Do not use a public issue, and do not report through the GitHub mirror. You will hear back within five working days.
```

`docker-compose.yml` (both the `web` and the `worker` service) and `docker-compose.demo.yml` (`web`): replace each `image: ghcr.io/your-org/better-search-lab:latest` line with these two lines at the same indentation:

```yaml
    # The published image; override with BSL_IMAGE (a fork's registry, or a local tag in CI).
    image: ${BSL_IMAGE:-registry.gitlab.com/betterbrainlab/better-search-lab:latest}
```

`README.md` line 12 and `docs/install.md` line 8: `git clone https://gitlab.com/betterbrainlab/better-search-lab.git` (Task 4 restructures both quick starts; only the URL changes here).

`.github/ISSUE_TEMPLATE/config.yml` line 4: `url: https://gitlab.com/betterbrainlab/better-search-lab/-/blob/main/SECURITY.md` (Task 3 rewrites this file; this keeps the guard green now).

- [ ] **Step 4: Replace CONTRIBUTING's placeholder section with the release checklist**

Delete from the line `## Before you tag a release` through the line that begins `Then enable private vulnerability reporting` (inclusive), and put this in its place:

```markdown
## Releasing (maintainers)

1. Bump `version` in `package.json` and `mcp/package.json` to the same value, then `cd mcp && npm install --package-lock-only` so the lockfile follows. Set the release date and the two link definitions at the bottom of `CHANGELOG.md` (`1.0.0` still ships as `2026-09-XX` until the first tag).
2. Push `main` and wait for a green pipeline.
3. Tag and push the tag: `git tag v1.2.3 && git push origin v1.2.3`.
4. The tag pipeline runs `preflight` (the tag matches both versions, `NPM_TOKEN` exists), `image` (multi-arch to `registry.gitlab.com/betterbrainlab/better-search-lab:1.2.3` and `:latest`, plus Docker Hub when configured), `npm` (`@better-search-lab/mcp`), and `release` (a GitLab Release whose notes are the CHANGELOG section for that version).

CI variables, under Settings → CI/CD → Variables, masked: `NPM_TOKEN` (required, an npm automation token for `@better-search-lab`); `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (optional, adds a Docker Hub copy under `DOCKERHUB_NAMESPACE`, which defaults to the username).

The GitHub repository at https://github.com/Heshamus/better-search-lab is a read-only mirror: configure it once under Settings → Repository → Mirroring repositories (push, `https://github.com/Heshamus/better-search-lab.git`, a fine-grained token with contents read/write), and on GitHub turn off Issues, Wiki and Projects. The `.github/` folder in this tree only redirects people here.

Forks change nothing in the tree: the image name comes from `CI_REGISTRY_IMAGE`, the compose files read `BSL_IMAGE`, and `install.sh` reads `BSL_IMAGE` and `BSL_REF`.
```

- [ ] **Step 5: Run the tests, the build and the guard**

Run: `pnpm exec vitest run tests/repo/` — Expected: PASS (all files).
Run: `git grep -n -e "<org>" -e "your-org" -e "ghcr.io" -- . ":!docs/superpowers" ":!tests/repo/placeholders.test.ts"` — Expected: no output.
Run: `pnpm exec tsc --noEmit` — clean. Run: `pnpm exec vitest run` — PASS. Run: `pnpm build` — green. Run (package metadata changed): `cd mcp && npx vitest run` — PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json mcp/package.json src/lib/demo/links.ts CHANGELOG.md SECURITY.md docker-compose.yml docker-compose.demo.yml README.md docs/install.md CONTRIBUTING.md .github/ISSUE_TEMPLATE/config.yml tests/repo/placeholders.test.ts tests/repo/community-files.test.ts
git commit -m "chore(release): point the tree at gitlab.com/betterbrainlab and the GitLab registry"
```

---

### Task 3: GitLab templates and a redirect-only GitHub folder

**Files:**
- Create: `.gitlab/issue_templates/Bug.md`, `.gitlab/issue_templates/Feature.md`, `.gitlab/merge_request_templates/Default.md`
- Modify: `.github/ISSUE_TEMPLATE/config.yml` (rewrite), `.github/PULL_REQUEST_TEMPLATE.md` (rewrite), `README.md` (one line under the title, one word in "Contributing"), `CONTRIBUTING.md:30,65-67` ("pull request" → "merge request")
- Delete: `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`
- Test: `tests/repo/community-files.test.ts` (the `exist` list and one new test)

**Interfaces:**
- Consumes: the confidential-issue URL from Task 2.
- Produces: GitLab template names `Bug` and `Feature` (the redirect links open them with `issuable_template=Bug` / `issuable_template=Feature`); the `Default` merge-request template GitLab applies automatically.

- [ ] **Step 1: Write the failing tests**

In `tests/repo/community-files.test.ts`, replace the `exist` test and add a test after it:

```ts
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
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("https://github.com/Heshamus/better-search-lab");
    expect(readme).not.toMatch(/pull request/i);
    expect(readFileSync("CONTRIBUTING.md", "utf8")).not.toMatch(/pull request/i);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run tests/repo/community-files.test.ts`
Expected: FAIL — `.gitlab/issue_templates/Bug.md` does not exist.

- [ ] **Step 3: Create the GitLab templates**

`.gitlab/issue_templates/Bug.md`:

```markdown
## What happened

<!-- What you did, what you expected, what you saw instead. -->

## Version and install

<!-- The version from /api/health, and how it runs: Docker Compose, Railway, bare metal. -->

## Logs

<!-- `docker compose logs web worker` around the time it happened. Redact secrets. -->
```

`.gitlab/issue_templates/Feature.md`:

```markdown
## The problem

<!-- What you are trying to do and what gets in the way today. -->

## Proposal

<!-- Optional: how you would like it to work. -->
```

`.gitlab/merge_request_templates/Default.md`:

```markdown
## What and why

<!-- One paragraph. Link the issue or the spec/plan section this implements. -->

## How to verify

<!-- Commands or clicks a reviewer can repeat. Mention any setup (keys, demo mode). -->

## Checklist

- [ ] Tests added or updated; `pnpm exec vitest run`, `pnpm exec tsc --noEmit` and `pnpm build` are green
- [ ] No fabricated data: absent or failed data renders as such
- [ ] `pnpm docs:config` run if the settings registry changed; migration committed if the schema changed
- [ ] No internal hostnames, names or secrets
```

- [ ] **Step 4: Turn the GitHub folder into a redirect, fix the wording**

`.github/ISSUE_TEMPLATE/config.yml`, whole file:

```yaml
# This GitHub repository is a read-only mirror of
# https://gitlab.com/betterbrainlab/better-search-lab. Issues live there.
blank_issues_enabled: false
contact_links:
  - name: Report a bug
    url: https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issuable_template=Bug
    about: Opens the bug template on GitLab, where the project is developed.
  - name: Request a feature
    url: https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issuable_template=Feature
    about: Feature requests and questions live on GitLab too.
  - name: Report a vulnerability
    url: https://gitlab.com/betterbrainlab/better-search-lab/-/issues/new?issue%5Bconfidential%5D=true
    about: Opens a confidential issue that only maintainers can see.
```

`.github/PULL_REQUEST_TEMPLATE.md`, whole file:

```markdown
This GitHub repository is a read-only mirror of https://gitlab.com/betterbrainlab/better-search-lab.

Pull requests here are closed unmerged. Please open a merge request on GitLab instead:
https://gitlab.com/betterbrainlab/better-search-lab/-/merge_requests/new
```

```bash
git rm .github/ISSUE_TEMPLATE/bug.yml .github/ISSUE_TEMPLATE/feature.yml
```

`README.md`: insert this paragraph between the `# Better Search Lab` heading and the paragraph that begins "Self-hosted SEO", with a blank line on each side:

```markdown
Canonical repository: [gitlab.com/betterbrainlab/better-search-lab](https://gitlab.com/betterbrainlab/better-search-lab). The copy at [github.com/Heshamus/better-search-lab](https://github.com/Heshamus/better-search-lab) is a read-only mirror; issues and merge requests live on GitLab.
```

Also in `README.md`, under "## Contributing", change `Issues and pull requests are welcome` to `Issues and merge requests are welcome on GitLab`.

`CONTRIBUTING.md`: line 30, `Small fixes can go straight to a pull request.` → `Small fixes can go straight to a merge request.`; the last section becomes:

```markdown
## Merge requests

Fill in the template. Keep one concern per merge request; note anything the reviewer must set up to verify.
```

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run tests/repo/` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitlab .github README.md CONTRIBUTING.md tests/repo/community-files.test.ts
git commit -m "docs: GitLab issue and merge-request templates; the GitHub folder only redirects"
```

---

### Task 4: The one-command installer, wired into CI and the docs

**Files:**
- Create: `install.sh` (mode 755), `tests/repo/install-script.test.ts`
- Modify: `.gitlab-ci.yml` (the `demo-smoke` job), `.gitignore` (one line), `README.md` (the "Try it in five minutes" section and the first "Install" bullet), `docs/install.md` (lead with the one-liner), `docs/upgrading.md` (the "Between 1.x releases" section)

**Interfaces:**
- Consumes: the compose `${BSL_IMAGE:-…}` expression from Task 2; the raw URL base from Global Constraints.
- Produces: `install.sh` with flags `--demo` and `--help` and the environment overrides `BSL_DIR` (target folder, default `better-search-lab`; relative to where the script runs), `BSL_REF` (git ref for the raw download, default `main`), `BSL_IMAGE` (image override, exported to compose), `BSL_COMPOSE_FILE` (copy this local file instead of downloading; relative paths resolve from where the script runs), `BSL_PULL` (`0` skips `docker compose pull`), `BSL_HEALTH_URL` (default `http://127.0.0.1:3000/api/health`).

- [ ] **Step 1: Write the failing test**

`tests/repo/install-script.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The installer is the first thing a self-hoster runs, piped through sh. It is
// tested for real in CI (demo-smoke runs it against the locally built image);
// here we pin its shape so a careless edit cannot ship a broken one-liner.
const script = readFileSync("install.sh", "utf8");

describe("install.sh", () => {
  it("is executable POSIX sh that parses", () => {
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(execFileSync("git", ["ls-files", "-s", "install.sh"], { encoding: "utf8" })).toMatch(/^100755 /);
    execFileSync("sh", ["-n", "install.sh"]);
    expect(script).toContain("set -eu");
  });
  it("downloads the compose file from the canonical raw URL and supports the demo", () => {
    expect(script).toContain("https://gitlab.com/betterbrainlab/better-search-lab/-/raw/");
    expect(script).toContain("docker-compose.demo.yml");
    expect(script).toContain("--demo");
  });
  it("generates AUTH_SECRET, honours the overrides, never builds, and waits for the health route", () => {
    expect(script).toContain("openssl rand -base64 32");
    expect(script).toContain("/dev/urandom");
    for (const v of ["BSL_DIR", "BSL_REF", "BSL_IMAGE", "BSL_COMPOSE_FILE", "BSL_PULL", "BSL_HEALTH_URL"]) expect(script, v).toContain(v);
    expect(script).toContain("up -d --no-build"); // the folder has no Dockerfile; the image was pulled or supplied
    expect(script).toContain("/api/health");
    expect(script).not.toMatch(/\$0/); // piped through sh, $0 is not the script
  });
  it("CI runs the installer against the locally built image before anything is published", () => {
    const ci = readFileSync(".gitlab-ci.yml", "utf8");
    const smoke = ci.match(/\ndemo-smoke:\n([\s\S]*?)(?=\n[\w.-]+:\n|$)/)?.[1] ?? "";
    expect(smoke).toContain("sh install.sh --demo");
    expect(smoke).toContain("BSL_IMAGE=");
  });
  it("the docs lead with the one-liner", () => {
    const oneLiner = "curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh";
    expect(readFileSync("README.md", "utf8")).toContain(oneLiner);
    expect(readFileSync("docs/install.md", "utf8")).toContain(oneLiner);
    expect(readFileSync("docs/install.md", "utf8")).toContain("sh -s -- --demo");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/repo/install-script.test.ts`
Expected: FAIL — `ENOENT … install.sh`.

- [ ] **Step 3: Write `install.sh`**

```sh
#!/bin/sh
# Better Search Lab installer. Docker (with Compose v2) is the only requirement.
#
#   curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh
#   curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh -s -- --demo
#
# It creates a folder, downloads the compose file, generates AUTH_SECRET into
# .env, starts the stack and waits for /api/health. Overrides, for forks and CI:
#   BSL_DIR           target folder (default: better-search-lab)
#   BSL_REF           git ref the compose file is downloaded from (default: main)
#   BSL_IMAGE         image to run instead of the published one (exported to compose)
#   BSL_COMPOSE_FILE  a local compose file to copy instead of downloading
#   BSL_PULL=0        skip `docker compose pull` (a local BSL_IMAGE cannot be pulled)
#   BSL_HEALTH_URL    where to wait for readiness (default: http://127.0.0.1:3000/api/health)
set -eu

MODE=app
for arg in "$@"; do
  case "$arg" in
    --demo) MODE=demo ;;
    -h|--help)
      echo "usage: install.sh [--demo]"
      echo "  --demo   start the read-only demo (two synthetic sites, no keys) instead of a real install"
      exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

RAW="https://gitlab.com/betterbrainlab/better-search-lab/-/raw/${BSL_REF:-main}"
DIR="${BSL_DIR:-better-search-lab}"
if [ "$MODE" = demo ]; then FILE=docker-compose.demo.yml; else FILE=docker-compose.yml; fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (the 'docker compose' command)." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }

mkdir -p "$DIR"
# Copy or download before changing directory, so a relative BSL_COMPOSE_FILE works.
if [ -n "${BSL_COMPOSE_FILE:-}" ]; then
  cp "$BSL_COMPOSE_FILE" "$DIR/$FILE"
else
  curl -fsSL "$RAW/$FILE" -o "$DIR/$FILE"
fi
cd "$DIR"

if [ "$MODE" = app ] && [ ! -f .env ]; then
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 32)"
  else
    SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  fi
  printf 'AUTH_SECRET=%s\nAPP_URL=http://localhost:3000\n' "$SECRET" > .env
  chmod 600 .env
  echo "Wrote .env with a generated AUTH_SECRET. Change APP_URL there if this runs behind a domain."
fi

# Compose reads BSL_IMAGE from the environment; a fork or CI points it at another image.
if [ -n "${BSL_IMAGE:-}" ]; then export BSL_IMAGE; fi

if [ "${BSL_PULL:-1}" != 0 ]; then docker compose -f "$FILE" pull; fi
# --no-build: this folder has no Dockerfile. The image was pulled, or BSL_IMAGE names one that exists.
docker compose -f "$FILE" up -d --no-build

URL="${BSL_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
i=0
until curl -fsS "$URL" 2>/dev/null | grep -q '"ok":true'; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "The app did not report healthy within five minutes. Logs: docker compose -f $DIR/$FILE logs web" >&2
    exit 1
  fi
  sleep 5
done

echo "Better Search Lab is running at http://localhost:3000"
if [ "$MODE" = demo ]; then
  echo "Sign in with 'Explore the demo'. The demo MCP token is bsl_demo_readonly."
else
  echo "Open it to create your admin account and connect DataForSEO. Update later with: cd $DIR && docker compose pull && docker compose up -d"
fi
```

Then run `chmod +x install.sh` and `git add install.sh`; `git ls-files -s install.sh` must show mode `100755`.

- [ ] **Step 4: Make CI run the installer**

In `.gitlab-ci.yml`, replace the `demo-smoke` job's `script` and `after_script` with:

```yaml
  script:
    - docker build -t better-search-lab:ci .
    # The same installer a self-hoster runs, pointed at the image just built.
    # Ports published inside docker-in-docker are reachable on the service's
    # hostname ("docker"), not on localhost.
    - export BSL_IMAGE=better-search-lab:ci BSL_PULL=0 BSL_DIR=.smoke BSL_COMPOSE_FILE=docker-compose.demo.yml BSL_HEALTH_URL=http://docker:3000/api/health
    - sh install.sh --demo
    - curl -fsS http://docker:3000/login | grep -q "Explore the demo"
    - test "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://docker:3000/api/users)" = "403"
  after_script:
    - docker compose -f .smoke/docker-compose.demo.yml logs --no-color --tail=50 web || true
    - docker compose -f .smoke/docker-compose.demo.yml down -v || true
```

Append to `.gitignore`:

```
# install.sh smoke runs (CI and local)
.smoke/
```

- [ ] **Step 5: Lead the docs with the one-liner**

`README.md`: replace the "Try it in five minutes" section (from the `## Try it in five minutes` line through the paragraph that ends with `(\`DEMO_MODE\`).`) with:

````markdown
## Try it in five minutes

Docker is the only requirement:

```bash
curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh
```

This creates a `better-search-lab` folder, generates a secret, starts Postgres, the app and the worker, and prints the address. Open `http://localhost:3000` — on first run it redirects to `/setup`, which creates your admin account, connects DataForSEO (a $5 balance is plenty to start), profiles your site, suggests competitors, and builds the first picture. Active time: about five minutes; DataForSEO spend for a 150-keyword site: about $0.37. Everything else — an AI assistant, Google, email, Reddit — is optional and lives under **Settings → Integrations**.

Want to look before you connect anything? Add `-s -- --demo` to the command above (`… | sh -s -- --demo`) for a read-only demo with two synthetic sites and ninety days of history (`DEMO_MODE`).

Prefer the source? `git clone https://gitlab.com/betterbrainlab/better-search-lab.git && cd better-search-lab && cp .env.example .env && docker compose up -d --build`, after setting `AUTH_SECRET` in `.env`.
````

In the README's "Install" list, replace the first bullet (`- **Docker Compose** (recommended): the five lines above. …`) with:

```markdown
- **One command** (recommended): the installer above. `docs/install.md` covers updates, volumes, reverse proxies, and the worker.
```

`docs/install.md`: replace the "Docker Compose (recommended)" section (from `## Docker Compose (recommended)` through the `- Backups:` bullet) with:

````markdown
## One command (recommended)

Requirements: Docker with Compose v2, and `curl`.

```bash
curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh
```

The installer creates a `better-search-lab` folder next to where you ran it, downloads `docker-compose.yml`, writes a `.env` with a generated `AUTH_SECRET` and `APP_URL=http://localhost:3000`, pulls the published image, starts `db` (Postgres 16 on a named volume), `web` (runs the migrations, then the app on port 3000) and `worker` (scheduled refreshes and on-demand jobs), and waits for `/api/health`. Open the address it prints and follow the wizard. Behind a domain, set `APP_URL` in that `.env` to the public address and run `docker compose up -d` again.

For the read-only demo instead: `curl -fsSL https://gitlab.com/betterbrainlab/better-search-lab/-/raw/main/install.sh | sh -s -- --demo`.

- Update: `cd better-search-lab && docker compose pull && docker compose up -d`. Migrations run on every start and are idempotent; see [upgrading.md](upgrading.md).
- Logs: `docker compose logs -f web worker`.
- Backups: the database lives in the `db-data` volume; `docker compose exec db pg_dump -U bsl bsl > backup.sql`.
- Forks and other registries: `BSL_IMAGE=your.registry/better-search-lab:tag` in the environment before the command runs that image instead.

## From source

```bash
git clone https://gitlab.com/betterbrainlab/better-search-lab.git
cd better-search-lab
cp .env.example .env            # set AUTH_SECRET (openssl rand -base64 32) and APP_URL
docker compose up -d --build
```

The same three services, built from the working tree. Update with `git pull && docker compose up -d --build`.
````

Keep the "Behind a reverse proxy", "Railway", "Bare metal" and "The demo" sections. In "The demo", insert this line before the existing code block: `The installer's \`--demo\` flag is the short way; from a clone:`.

`docs/upgrading.md`: replace the body of "Between 1.x releases" (the single line under that heading) with:

```markdown
Installer and image installs: `docker compose pull && docker compose up -d`. Source installs: `git pull && docker compose up -d --build`. Check the [CHANGELOG](../CHANGELOG.md) for anything marked *migration*.
```

- [ ] **Step 6: Try the installer locally against a local image, then run the tests**

From the repo root, one plain command at a time (Docker is available here; the default health URL uses `127.0.0.1` because another process on this machine listens on the IPv6 side of port 3000):

```bash
docker build -t better-search-lab:local .
env BSL_IMAGE=better-search-lab:local BSL_PULL=0 BSL_DIR=.smoke BSL_COMPOSE_FILE=docker-compose.demo.yml sh install.sh --demo
curl -s http://127.0.0.1:3000/api/health
docker compose -f .smoke/docker-compose.demo.yml down -v
rm -rf .smoke
docker image rm better-search-lab:local
```

Expected: the installer prints "Better Search Lab is running at http://localhost:3000" and the health body contains `"ok":true`. If the port is busy, stop whatever holds IPv4 port 3000 first; do not kill processes you did not start — report instead.

Run: `ruby -ryaml -e 'YAML.load_file(".gitlab-ci.yml"); puts "yaml ok"'` — Expected: `yaml ok`.
Run: `git status --short` — Expected: no `.smoke` entry (ignored).
Run: `pnpm exec vitest run tests/repo/` — Expected: PASS (the docs-links test still resolves every link; the placeholder guard is still clean).
Run: `pnpm exec tsc --noEmit` — clean. Run: `pnpm exec vitest run` — PASS. Run: `pnpm build` — green.

- [ ] **Step 7: Commit**

```bash
git add install.sh tests/repo/install-script.test.ts .gitlab-ci.yml .gitignore README.md docs/install.md docs/upgrading.md
git commit -m "feat(install): one-command installer, run by CI against the built image; docs lead with it"
```

---

## Done criteria

1. `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm build`, `cd mcp && npx vitest run` green on the final commit.
2. `git grep -n -e "<org>" -e "your-org" -e "ghcr.io" -- . ":!docs/superpowers" ":!tests/repo/placeholders.test.ts"` prints nothing; the internal-names guard still passes with the three remaining terms.
3. `.github/` holds only `ISSUE_TEMPLATE/config.yml` and `PULL_REQUEST_TEMPLATE.md`; `.gitlab/` holds the three templates.
4. The installer, run locally against a locally built image with `--demo`, reaches a healthy demo.
5. Owner steps after merge (not code): push `main` to GitLab and confirm the pipeline is green; add `NPM_TOKEN` (and optionally the Docker Hub variables); configure the push mirror to `github.com/Heshamus/better-search-lab` and switch off Issues, Wiki and Projects there; set the CHANGELOG date; tag `v1.0.0`.

## Left for later

Docker Hub namespace (owner decides), Renovate on GitLab, the Codeberg mirror, the self-contained demo image and its hosting (stream B), and the reach work (stream E).
