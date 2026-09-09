# Contributing

Thanks for helping. Better Search Lab is a small, opinionated codebase; the notes below keep changes fast to review.

## Set up

```bash
pnpm install
docker compose up -d db            # a Postgres for local development
cp .env.example .env               # set AUTH_SECRET and DATABASE_URL=postgres://bsl:bsl@localhost:5432/bsl
pnpm db:migrate
pnpm dev                           # http://localhost:3000
pnpm worker                        # in a second terminal
```

## Tests

```bash
pnpm exec vitest run               # the suite: in-memory Postgres (pglite), no network, no spend
pnpm exec tsc --noEmit
pnpm build
cd mcp && npx vitest run           # the MCP package
TEST_DATABASE_URL=postgres://bsl:bsl@localhost:5432/bsl pnpm exec vitest run tests/postgres   # real-Postgres concurrency suite
```

Every change ships with tests. DataForSEO calls are tested against recorded fixtures under `src/lib/dataforseo/fixtures/`; never add a test that spends money or reaches the network.

## How work happens

Bigger changes start as a design document under `docs/superpowers/specs/`, become a plan under `docs/superpowers/plans/`, and are built task by task from the plan — see [docs/superpowers/README.md](docs/superpowers/README.md). Small fixes can go straight to a merge request.

## Conventions

- Commit messages: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`, `chore(scope): …`, `ci: …`.
- Pages are server components reading `src/lib/*`; mutations are client components calling guarded `/api/*` routes.
- Honesty is structural: missing, failed or undecryptable data renders as such — never a fabricated number.
- Design tokens come from `src/app/globals.css` (`panel`, `eyebrow`, `tnum`, `accent`, `at-risk`, `up`, `down`).
- After changing `src/lib/config/registry.ts`, run `pnpm docs:config`.
- After changing `src/db/schema.ts`, run `pnpm db:generate` and commit the migration.

## Releasing (maintainers)

1. Bump `version` in `package.json` and `mcp/package.json` to the same value, then `cd mcp && npm install --package-lock-only` so the lockfile follows. Update the MCP download URL in `README.md`, `docs/mcp.md` and `mcp/README.md` to the new tag (`tests/repo/mcp-distribution.test.ts` pins it to the version). Set the release date and the two link definitions at the bottom of `CHANGELOG.md` (`1.0.0` still ships as `2026-09-XX` until the first tag).
2. Push `main` and wait for a green pipeline.
3. Tag and push the tag: `git tag v1.2.3 && git push origin v1.2.3`.
4. The tag pipeline runs `preflight` (the tag matches both versions), `publish-image` (multi-arch to `registry.gitlab.com/betterbrainlab/better-search-lab:1.2.3` and `:latest`, plus Docker Hub when configured), `package-mcp` (builds and packs `mcp/`, uploads `better-search-lab-mcp.tgz` to the project's generic package registry), and `release` (a GitLab Release whose notes are the CHANGELOG section for that version, with the tarball linked as `/-/releases/v1.2.3/downloads/better-search-lab-mcp.tgz`). Nothing is published to npm.

No CI variable is required. `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (protected and masked) optionally add a Docker Hub copy under `DOCKERHUB_NAMESPACE`, which defaults to the username. Protect the `v*` tags (Settings → Repository → Protected tags, create: Maintainers) so only maintainers can start a release; protected variables are exposed only on protected refs, so keep the two together if you add any. Leave "run pipelines for merge requests from forks in the parent project" off.

The MCP download URL is anonymous only while the project is **public** with the Package registry and Releases features enabled — making the project private, or disabling either feature, breaks every `npx` snippet in the README and docs. When re-running a release for a tag that already exists, delete that release's `better-search-lab-mcp.tgz` asset link first (the API rejects a duplicate link name), and consider Settings → Packages and registries → Generic packages → **Reject duplicates** so the tarball is write-once (this makes a same-tag re-run of `package-mcp` fail by design).

The GitHub repository at https://github.com/Heshamus/better-search-lab is a read-only mirror: configure it once under Settings → Repository → Mirroring repositories (push, `https://github.com/Heshamus/better-search-lab.git`, a fine-grained token with contents read/write), and on GitHub turn off Issues, Wiki and Projects. The `.github/` folder in this tree only redirects people here.

Forks change nothing in the tree: the image name comes from `CI_REGISTRY_IMAGE`, the compose files read `BSL_IMAGE`, and `install.sh` reads `BSL_IMAGE` and `BSL_REF`.

## Merge requests

Fill in the template. Keep one concern per merge request; note anything the reviewer must set up to verify.
