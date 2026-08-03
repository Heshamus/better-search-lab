# Phase 0 — Deferred Items / Phase 1 Backlog

Every item below was surfaced during the Phase 0 build (per-task reviews + the final
whole-branch review) and **triaged OK-TO-DEFER** — none block Phase 0. They are safe for a
single-worker internal tool today; fold them in during Phase 1 where noted. (Full audit trail:
the SDD ledger at `.superpowers/sdd/2026-08-02-phase-0-foundation/progress.md`, gitignored.)

## DataForSEO client hardening — *do when Phase 1 wires live calls* (dormant in Phase 0)
- Wrap transport-level errors (DNS / timeout / reset) in `DataForSeoError` and retry them — currently only 429/5xx retry; a raw `fetch` rejection propagates unwrapped.
- Drain a retryable response body before the next attempt (connection hygiene).
- Set `DataForSeoError.name = "DataForSeoError"`.
- Type the SERP parse path (a `RawSerpItem` interface) instead of `any`; assert the request-body shape in a test; tighten the `rows` assertion to an exact count.

## Job runner / worker — *revisit at multi-worker scale* (single-worker safe now)
- Add a lease / staleness check to the re-claim path (two genuinely-concurrent `runJob` calls for the same key could both run the handler).
- Worker: add `SIGTERM`/`SIGINT` graceful shutdown (stop the cron); add failure alerting — scheduled-run errors are currently a silent `console.error`.

## Auth / security hardening — *not exploitable now* (internal allowlisted tool, operator-seeded)
- Add a case-insensitive unique constraint on `users.email` (`unique(lower(email))` or `citext`) — defense-in-depth against a case-differing duplicate row.
- Optional: constant-time auth to remove the user-enumeration timing side-channel.
- Tighten the middleware matcher — it currently excludes the literal substring `login`, so a future `/login-*` route would bypass the guard.

## Validation / robustness — *Phase 1, when the create-project UI ships*
- Validate the projects `POST` body (Zod) → `400` on malformed input (currently a framework `500`, post-auth only); make `createProject` transactional (project + competitors); dedup/normalize competitor domains.
- Tighten the `DATABASE_URL` zod check (currently `.startsWith("postgres")`).

## Build / deploy ergonomics
- Lazy-init the DB client (don't call `loadEnv()` at module import) so `pnpm build` doesn't need secrets; consider per-entrypoint env subsets so the worker isn't handed web-only secrets it never uses.
- Wrap `migrate.ts` `sql.end()` in try/finally.
- Add a "migrations apply to pglite" / `drizzle-kit check` test to guard schema↔migration drift (tests build the DB from `schema.ts` via `pushSchema`; prod applies the committed `drizzle/*.sql` — they match today, but nothing guards future drift).

## Test output & cosmetics
- Silence the recurring drizzle-kit `pushSchema` "Pulling schema…" stdout notice inside `createTestDb` (buffer stdout around the call); consider Vitest's native `resolve.tsconfigPaths` to drop the `vite-tsconfig-paths` deprecation notice.
- Remove the inert `@types/bcryptjs`; collapse the redundant `PRICES` map entries; strengthen a few brief-inherited single-case test assertions.

## Dashboard polish — *Phase 1*
- Upgrade `AppNav` to `next/link` (SPA transitions instead of full page loads); add a mobile-nav collapse.
