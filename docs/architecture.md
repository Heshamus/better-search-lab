# Architecture

One Next.js 15 application (App Router, React 19, TypeScript), one Postgres database, one worker process, one npm package for MCP.

## The shape

- **Pages are server components** under `src/app/(app)/` that read `src/lib/*` directly and render with the Signal design system (`src/app/globals.css`). Every one of them is `force-dynamic` and validates the session against the users table in the shared layout.
- **Mutations are client components** calling session-guarded routes under `src/app/api/`, then `router.refresh()`. Admin-only routes use `requireAdmin`; MCP routes use a bearer token.
- **Long work is a job.** Routes enqueue into the `jobs` table; the worker (`worker/index.ts`) drains the queue and runs the cron schedule; handlers report progress lines that the UI polls (`src/lib/jobs/`).
- **Configuration** is a typed registry (`src/lib/config/registry.ts`). Values live encrypted in the `settings` table; an environment variable with the same name overrides them; `getConfig()` merges both into one `AppConfig`, and `src/lib/config/clients.ts` turns that into DataForSEO, LLM, email and Eden AI clients — or `null` with a "connect it in Settings" message.
- **DataForSEO** is reached only through `src/lib/dataforseo/client.ts`; every wrapper is fixture-tested and every call is logged to the usage meter with its list price.
- **The opportunity engine** (`src/lib/core/`) is pure: detectors read signals (rank history, metrics, gaps, Search Console pages), a scorer blends volume, winnability, position, trend and relevance, and the weekly handler stores the result.
- **Demo mode** seeds two synthetic sites through the same store functions at boot and refuses every API write in middleware.

## Data

Drizzle ORM (`src/db/schema.ts`), migrations in `drizzle/`, applied on start. Tests run on pglite, an in-memory Postgres, with the schema pushed from the same file. A small real-Postgres suite (`tests/postgres/`) covers concurrency that pglite cannot.

## Where things are

| Concern | Path |
|---|---|
| Auth (users, sessions, rate limit, guards) | `src/lib/auth/`, `src/auth.ts`, `src/middleware.ts` |
| Configuration service | `src/lib/config/` |
| Jobs and handlers | `src/lib/jobs/` |
| Setup wizard | `src/lib/setup/`, `src/components/setup/`, `src/app/(auth)/setup/` |
| Demo mode | `src/lib/demo/`, `src/instrumentation.ts` |
| MCP package | `mcp/` |
| Specs and plans | `docs/superpowers/` |
