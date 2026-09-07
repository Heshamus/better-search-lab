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

Bigger changes start as a design document under `docs/superpowers/specs/`, become a plan under `docs/superpowers/plans/`, and are built task by task from the plan — see [docs/superpowers/README.md](docs/superpowers/README.md). Small fixes can go straight to a pull request.

## Conventions

- Commit messages: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`, `chore(scope): …`, `ci: …`.
- Pages are server components reading `src/lib/*`; mutations are client components calling guarded `/api/*` routes.
- Honesty is structural: missing, failed or undecryptable data renders as such — never a fabricated number.
- Design tokens come from `src/app/globals.css` (`panel`, `eyebrow`, `tnum`, `accent`, `at-risk`, `up`, `down`).
- After changing `src/lib/config/registry.ts`, run `pnpm docs:config`.
- After changing `src/db/schema.ts`, run `pnpm db:generate` and commit the migration.

## Pull requests

Fill in the template. Keep one concern per pull request; note anything the reviewer must set up to verify.
