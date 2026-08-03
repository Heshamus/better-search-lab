# seo-platform *(working name)*

Internal, self-hosted SEO platform — our own Search Atlas, powered by the **DataForSEO** API.
Standalone **Next.js + TypeScript** web app; **not** an MCP.

**Status:** Phase 0 (foundation) complete — allowlist-gated login, Postgres schema + migrations,
DataForSEO client, job runner/scheduler, and a standalone worker process, all behind a green
test suite. Phase 1 (rank tracking, research, the Opportunity Engine) is next.

📄 **Start here:** [`docs/superpowers/specs/2026-08-02-internal-seo-platform-design.md`](docs/superpowers/specs/2026-08-02-internal-seo-platform-design.md)

Scope: SEO intelligence (keyword research, rank tracking, competitive & keyword-gap analysis)
plus a weekly **Opportunity Engine** that surfaces the best few things to do for each site —
with a content engine and more following in later phases. No credit system; a transparent
internal usage/cost meter instead.

## Local development

Requires Node ≥ 20 and pnpm.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the env template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Postgres connection string (Supabase or local Postgres). |
   | `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | DataForSEO API Basic Auth credentials. |
   | `AUTH_SECRET` | Auth.js session-signing secret, 16+ chars (e.g. `openssl rand -base64 32`). |
   | `ALLOWLIST` | Comma-separated emails permitted to log in (no self-serve signup by design). |

3. Apply the database schema:

   ```bash
   pnpm db:migrate
   ```

4. Run the app:

   ```bash
   pnpm dev
   ```

   Visit `http://localhost:3000` and sign in with an allowlisted user (seed one manually into
   the `users` table with a `bcryptjs` password hash — there's no self-serve signup).

5. Run the background worker — a separate long-running process that registers cron schedules
   and runs jobs (Phase 0 ships one: a daily `health` job):

   ```bash
   pnpm worker
   ```

> **Note on env loading:** `pnpm dev` and `pnpm build` are Next.js commands, which auto-load
> `.env` for you. `pnpm db:migrate` and `pnpm worker` are plain `tsx` scripts and do **not**
> auto-load `.env` — like any Node process, they only see real environment variables. Load the
> file into your shell first, then run them in the same shell:
>
> ```bash
> set -a; source .env; set +a
> pnpm db:migrate
> ```
>
> This only matters locally — in production, Railway injects env vars directly into the
> process, so no `.env` file is present or needed there.

### Tests

```bash
pnpm test        # full suite, single run
pnpm test:watch  # watch mode
```

Tests run against fixtures and an in-memory Postgres (`@electric-sql/pglite`) — zero network
calls, zero DataForSEO spend. A `vite-tsconfig-paths` deprecation notice and a pglite "Pulling
schema from database…" spinner are expected/harmless.

### Database migrations

Schema lives in `src/db/schema.ts` (Drizzle ORM). After changing it, regenerate the migration:

```bash
pnpm db:generate   # drizzle-kit diffs schema.ts against drizzle/ and emits new SQL
```

Commit the generated `drizzle/*.sql` file together with the updated `drizzle/meta/` journal —
they're the migration artifact. `pnpm db:migrate` (`src/db/migrate.ts`) applies every migration
in `drizzle/` to `DATABASE_URL`; it's idempotent (already-applied files are skipped), so it's
safe to run again after adding a new one.

## Deploying

**1. Database — Supabase**

Create a dedicated Supabase project for this app and copy its Postgres connection string into
`DATABASE_URL`. Drizzle's migrator runs DDL and expects prepared-statement support, which
Supabase's transaction-mode pooler (port 6543) doesn't provide — use the session pooler or the
direct connection string for `DATABASE_URL`.

**2. App — Railway (web + worker)**

This repo ships two Railway service configs. Railway's config-as-code format describes **one
service per file** — there's no single-file, multi-service schema — so this is a deliberate
two-file setup, not an oversight:

| Service | Config file | Build | Start |
| --- | --- | --- | --- |
| `web` | `railway.json` (Railway's default path) | `pnpm install && pnpm build` | `pnpm start` |
| `worker` | `railway.worker.json` | `pnpm install` | `pnpm worker` |

Steps:

1. Create a new Railway project from this GitHub repo — this becomes the `web` service. It
   picks up `railway.json` automatically.
2. Add a second service to the *same* project from the *same* repo. In its Settings → **Config
   File Path**, point it at `railway.worker.json`.
3. On **both** services, set: `DATABASE_URL`, `AUTH_SECRET`, `ALLOWLIST`, `DATAFORSEO_LOGIN`,
   `DATAFORSEO_PASSWORD`.
   - `web` needs them at **build time**, not just at runtime: `pnpm build` imports
     `src/db/client.ts`, which calls the env loader at module load, so a missing/invalid var
     fails the build itself. Railway service variables are available at both build and deploy
     stages, so setting them as normal service variables covers this.
   - `worker`'s build step is just `pnpm install` (it runs TypeScript straight via `tsx`, no
     Next.js build needed), so for it these variables are only a runtime requirement.
4. Deploy both services.
5. Run the migration **once** against the production database — via the Railway CLI
   (`railway run`) or a one-off shell from either service in the Railway dashboard:

   ```bash
   pnpm db:migrate
   ```

   Re-run after any deploy that adds a new migration file; already-applied files are skipped.

If Auth.js rejects requests with an "UntrustedHost" error behind Railway's proxy, set
`AUTH_TRUST_HOST=true` — Auth.js v5 auto-detects trusted hosts on Vercel but needs this
explicitly elsewhere.

**Single-service alternative:** if you don't want to run a second Railway service, deploy only
`web`. Phase 0's only scheduled job is a `health` check, so going without the worker isn't
urgent — add it back (`railway.worker.json`) once Phase 1 lands real scheduled work (rank
refresh, weekly opportunities).
