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

1. Bump `version` in `package.json` and `mcp/package.json` to the same value, then `cd mcp && npm install --package-lock-only` so the lockfile follows. Set the release date and the two link definitions at the bottom of `CHANGELOG.md` (`1.0.0` still ships as `2026-09-XX` until the first tag).
2. Push `main` and wait for a green pipeline.
3. Tag and push the tag: `git tag v1.2.3 && git push origin v1.2.3`.
4. The tag pipeline runs `preflight` (the tag matches both versions, `NPM_TOKEN` exists), `image` (multi-arch to `registry.gitlab.com/betterbrainlab/better-search-lab:1.2.3` and `:latest`, plus Docker Hub when configured), `npm` (`@better-search-lab/mcp`), and `release` (a GitLab Release whose notes are the CHANGELOG section for that version).

CI variables, under Settings → CI/CD → Variables, masked: `NPM_TOKEN` (required, an npm automation token for `@better-search-lab`); `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (optional, adds a Docker Hub copy under `DOCKERHUB_NAMESPACE`, which defaults to the username).

The GitHub repository at https://github.com/Heshamus/better-search-lab is a read-only mirror: configure it once under Settings → Repository → Mirroring repositories (push, `https://github.com/Heshamus/better-search-lab.git`, a fine-grained token with contents read/write), and on GitHub turn off Issues, Wiki and Projects. The `.github/` folder in this tree only redirects people here.

Forks change nothing in the tree: the image name comes from `CI_REGISTRY_IMAGE`, the compose files read `BSL_IMAGE`, and `install.sh` reads `BSL_IMAGE` and `BSL_REF`.

## Merge requests

Fill in the template. Keep one concern per merge request; note anything the reviewer must set up to verify.
