# Phase 2 — Deploy Notes

**Branch:** `phase-2-real-platform` (Phase 2: real research platform — auto-profiling, competitor CRUD + intelligence, real keyword gaps, research persistence, manual refresh + UX).

**Verification at branch tip (all green, controller-run 2026-08-04):**
- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec vitest run` — **194/194 across 64 files**, confirmed stable across consecutive runs (the earlier `pushSchema` parallel-load flake was fixed by raising the vitest timeout to 30s — commit `5dabbd4`).
- `pnpm build` — compiles, 9 static pages, no `/content` route (Content tab folded).

## New migrations (must be applied before the new features work)

Four additive migrations generated this phase (drizzle-kit; never hand-written):
- `0005_slippery_meggan.sql` — `profile_candidates` (auto-profile suggestions)
- `0006_flashy_banshee.sql` — `competitors.created_at` (ordering)
- `0007_great_prima.sql` — `competitor_keywords` (competitor intelligence)
- `0008_brave_serpent_society.sql` — `research_searches` (research recents)

All are additive (new table or new column); none alter or drop existing tables (verified via drizzle snapshot diffs during review).

## Deploy procedure (OWNER-DRIVEN — do NOT auto-deploy)

The seo-platform runs self-hosted on the Supergenius VPS (`/opt/seo-platform/`, Docker Compose: `seo-db` Postgres + `seo-web` Next.js + `seo-worker` + oauth2-proxies behind Traefik/Zitadel). Deployment is owner-driven and must be live-verified per the project's live-verification mandate.

1. **Merge/rsync** the branch to `/opt/seo-platform/app/` (rsync excludes `node_modules`/`.next`/`.git`/`.env`; the vendored `Dockerfile`/`.dockerignore` are in the repo).
2. **Run the migrations against the container DB BEFORE serving new code** — the new tables/column must exist or profiling/competitor-intel/research-persistence will error at runtime:
   `docker compose run --rm seo-web pnpm db:migrate` (or the project's established migrate path against the running `seo-db`).
3. **Rebuild + restart:** `docker compose build seo-web && docker compose up -d seo-web seo-worker`.
4. **Live-verify (owner):** this phase added no browser-driven E2E — visual/UX correctness of the new surfaces (edit-profile, competitor manager + intel panels, "Find keyword gaps", manual refresh buttons, research recents) is deferred to a real login walkthrough. Suggested smoke path on a real project: edit name/domain → Profile site → confirm candidates → add a competitor → refresh competitor intel → Find keyword gaps → Refresh data → Opportunities populates. A manual trigger (e.g. "Profile site") runs inside the **web** process, not the cron worker — its failure now surfaces directly in the UI as an error state (the refresh/profile routes report job failure as HTTP 502; see the honesty-seam fix), and any `console.warn` it emits lands in `seo-web` logs. Only the Monday cron job runs in `seo-worker` — watch that process's logs for scheduled-run failures, and DataForSEO usage/cost either way.

## DataForSEO cost note

New live calls (`rankedKeywords` for self-profiling + per competitor, `keywordIdeas` for expansion) are all capped at **top 300 by volume** and cost-logged via `estimateCost`/`logApiUsage`. Tests are fixture-based (zero live spend). A real profiling + 5-competitor-intel + gap run will consume DataForSEO credits — the first live run is a good moment to confirm the cost meter reads sane values.

## Deferred / final-review triage (tracked in the SDD ledger)

Low-risk items intentionally deferred (single-tenant scale), candidates for a follow-up pass: SELECT-then-write TOCTOU (no unique index/transaction) across `addCompetitor`/`addKeywords` and the delete-then-insert `save*` helpers; a11y (missing `<label>` on the competitor add-input, no `aria-live` on refresh/delete-confirm state); DRY (`fmt()` ×3, the refresh-button skeleton ×3, a duplicate "Profile site" button on Settings); ordering determinism (`competitorDomains` sort, `research_searches` secondary sort key). None block the feature set.
