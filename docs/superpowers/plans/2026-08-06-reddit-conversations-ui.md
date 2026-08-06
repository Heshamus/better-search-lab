# Reddit "Conversations Worth Joining" — Plan 2: UI + Editor + Cutover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Put a face on the (already live) backend: the **Trends tab becomes "Conversations worth joining"** — 3–5 cards each with the thread, the "why," a copyable drafted reply + citations, and Go-to-thread + Dismiss/Mark-posted actions; plus a **Settings editor** for the per-project knowledge & voice brief + subreddits; plus an on-demand **Refresh scan**. Fold in the subreddit-scrape **timeout fix**, and **retire the old SerpApi radar** (the cutover). Then live-verify in the real browser.

**Architecture:** Reuse everything: the async enqueue→`useJob`→`router.refresh()` run-button pattern (mirror `run-gsc-sync-button.tsx` + its route), the Settings sub-component pattern (mirror `settings-form.tsx`/`profile-review.tsx`), and the Plan-1 store (`listLatestConversations`, `getRedditConfig`, `saveRedditConfig`; add `updateConversationStatus`). New: 3 thin routes, 3 client components, the Trends/Settings page wiring. Full design: `docs/superpowers/specs/2026-08-06-reddit-conversations-design.md` §10.

**Tech stack:** Next.js 15 App Router, React 19, Drizzle, vitest (+ jsdom / @testing-library/react), Tailwind v4, existing `viz.tsx`/`empty-state` primitives.

## Global Constraints

- **Gate the UI on `APIFY_API_KEY`** (mirror how the old Trends page gated on `SERPAPI_API_KEY`): absent → a "connect Apify" configure state, not a broken scan button.
- **Honesty in the card:** gate the "review before posting" flag on `draftable && promoRisk==="high"` where `draftable = draftReply.trim() !== ""`; an empty `draftReply` renders a **"✍️ No draft — write your own"** note, never an empty/fake reply block. (Same rule the email uses.)
- **Draft-only:** the "Go to thread" button links out to Reddit; there is NO posting from the app. "Mark posted" only updates a local `status` for the owner's own tracking.
- **Reuse, don't reinvent:** the run-button/`useJob` pattern, the Settings sub-component pattern, `esc`-free React (React escapes by default), the store functions.
- **Cutover:** once the new Trends UI renders, retire the old radar UI + the now-orphaned `reddit_radar_scan` handler/route/libs/components. Leave the `reddit_radar_snapshots` **table** in place (dropping it needs a migration; harmless dormant).
- **Commits:** conventional, lowercase, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. No `git push`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/reddit/apify.ts` (modify) | raise per-run timeout; split subreddit `urls` into per-subreddit runs (Task 1) |
| `src/lib/reddit/conversations-store.ts` (modify) | add `updateConversationStatus` (Task 2) |
| `src/app/api/projects/[id]/reddit-conversations/scan/route.ts` (new) | enqueue `reddit_conversations_scan` (202 + jobId) |
| `src/app/api/projects/[id]/reddit-conversations/[convId]/status/route.ts` (new) | PATCH a conversation's status |
| `src/app/api/projects/[id]/reddit-config/route.ts` (new) | GET/PUT knowledgeBrief + subreddits |
| `src/components/run-conversations-scan-button.tsx` (new) | enqueue scan + `useJob` + refresh |
| `src/components/reddit-conversations.tsx` (new) | the cards |
| `src/components/reddit-brief-editor.tsx` (new) | Settings: brief + subreddits editor |
| `src/app/(app)/trends/page.tsx` (rewrite) | server: read `listLatestConversations` + config, gate APIFY, mount |
| `src/app/(app)/settings/page.tsx` (modify) | mount `<RedditBriefEditor>` |
| retire (Task 8) | `reddit-radar.tsx`, `run-reddit-radar-button.tsx`, `api/projects/[id]/reddit-radar/*`, `reddit_radar_scan` case + `redditRadarHandler`, `src/lib/reddit/{serpapi,radar,relevance,daily,store}.ts` |

---

## Task 1: Subreddit-scrape timeout fix

**Files:** Modify `src/lib/reddit/apify.ts`; Test `tests/lib/reddit/apify.test.ts`.

The live run showed the batched subreddit run (`urls:[...]`) hitting the 120s `AbortSignal.timeout` and dropping the whole (engagement-rich) subreddit source. Fix: (a) raise the per-run timeout to **240_000ms**, and (b) split the subreddit `urls` into **one run per subreddit** (each smaller/faster + fail-soft-isolated), same as searches already are per-term.

- [ ] **Step 1: Failing test** — extend `apify.test.ts`: given `subredditUrls: ["…/r/SEO/", "…/r/PPC/"]` and `searches: ["x"]`, capture the POSTed run bodies and assert there are **3 runs** — one `urls:["…/r/SEO/"]`, one `urls:["…/r/PPC/"]`, one `searchQuery:"x"` (i.e. one subreddit per run, not a single batched `urls` array). And assert the request uses `AbortSignal.timeout(240000)` (or that the timeout constant is 240_000 — assert via a small exported `RUN_TIMEOUT_MS` const if cleaner).
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement:** change the subreddit-run construction to map each `subredditUrls[i]` to its own `{ urls:[u], sort, timeFilter, maxPostsPerSource }` run; bump the timeout constant to `240_000`. Keep everything else (fail-soft per run, dedup, mapping). · **Step 4: Run → PASS** · **Step 5: Commit** `fix(reddit): per-subreddit apify runs + 240s timeout so the engagement-rich source lands`

---

## Task 2: `updateConversationStatus` store fn

**Files:** Modify `src/lib/reddit/conversations-store.ts`; Test `tests/lib/reddit/conversations-store.test.ts` (pglite).

**Interfaces produced:** `updateConversationStatus(db, projectId, id, status: "new"|"dismissed"|"posted"): Promise<void>` (scoped by BOTH projectId AND id so one project can't touch another's rows).

- [ ] **Step 1: Failing test** (pglite): save a conversation, `updateConversationStatus` to "dismissed", re-read via `listLatestConversations` → `status==="dismissed"`; updating a `(projectId,id)` that belongs to a *different* project is a no-op (0 rows).
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** (drizzle `update … set({status}) where(and(eq(projectId), eq(id)))`). · **Step 4: PASS** · **Step 5: Commit** `feat(reddit): updateConversationStatus store fn (project-scoped)`

---

## Task 3: three routes (scan / status / config)

**Files:** Create the three route files; Test `tests/app/reddit-conversations-routes.test.ts` (mirror `tests/app/job-routes.test.ts` module-mock style).

**Interfaces produced:**
- `POST /api/projects/[id]/reddit-conversations/scan` → `requireSession` → `enqueueJob(db, { type:"reddit_conversations_scan", projectId })` → `202 { jobId }`. Mirror `src/app/api/projects/[id]/refresh/route.ts` exactly (same enqueue shape).
- `PATCH /api/projects/[id]/reddit-conversations/[convId]/status` → `requireSession` → body `{ status }` (validate ∈ new|dismissed|posted, else 400) → `updateConversationStatus(db, id, convId, status)` → `200 { ok:true }`.
- `GET /api/projects/[id]/reddit-config` → `requireSession` → `getRedditConfig` → `{ knowledgeBrief, subreddits }`. `PUT` → body `{ knowledgeBrief?, subreddits? }` (subreddits: coerce to string[], trim, strip leading `r/`, drop empties) → `saveRedditConfig` → `200 { ok:true }`.

**Exact mirror for the scan route:** `src/app/api/projects/[id]/reddit-radar/scan/route.ts` is line-for-line what the new scan route is, only the job `type` differs (`reddit_conversations_scan` not `reddit_radar_scan`). Copy its structure.

- [ ] **Step 1: Failing test** (mirror job-routes: `vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: vi.fn(async () => "job-123") }))` + the auth mock, `params: Promise.resolve({ id: "p1" })`): scan → 202 + `enqueueJob` called with `{ type:"reddit_conversations_scan", projectId:"p1" }`; status route → 400 on a bad status, 200 + calls `updateConversationStatus` on a good one; config GET returns the stored shape; config PUT sanitizes subreddits (`" r/SEO "` → `"SEO"`) before save.
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** the three routes (thin; `params` is `Promise<{id,convId?}>` per Next 15 — mirror job-routes' `params: Promise.resolve(...)`). · **Step 4: PASS** · **Step 5: Commit** `feat(reddit): scan/status/config API routes for reddit conversations`

---

## Task 4: `RunConversationsScanButton`

**Files:** Create `src/components/run-conversations-scan-button.tsx`; Test `tests/components/run-conversations-scan-button.test.tsx` (jsdom).

Mirror `src/components/run-gsc-sync-button.tsx` (read it) almost verbatim — same `const job = useJob()`, same markup, only the URL + labels change: `onClick={() => void job.run(\`/api/projects/${projectId}/reddit-conversations/scan\`)}`, label "Scan Reddit" / "Scanning…". **`useJob` (`@/components/use-job`) already `router.refresh()`es on job completion** (line 72) — do NOT add your own refresh. Disabled while `job.state==="running"`; `job.error` surfaces the real error.

- [ ] **Step 1: Failing test** (jsdom; stub `global.fetch`: the enqueue POST → `{jobId:"j1"}`, then `/api/jobs/j1` → `{status:"done"}`): render, click → assert the FIRST fetch was a POST to `/api/projects/<id>/reddit-conversations/scan`, and the button is `disabled` while running. Don't re-assert `router.refresh` — that's `useJob`'s tested behavior, not this button's. **Step 2–4:** RED → implement (mirror run-gsc-sync-button) → GREEN. **Step 5: Commit** `feat(reddit): run-conversations-scan button (enqueue + poll)`

---

## Task 5: `RedditConversations` cards

**Files:** Create `src/components/reddit-conversations.tsx`; Test `tests/components/reddit-conversations.test.tsx` (jsdom).

**Consumes:** `StoredConversation[]` (from `@/lib/reddit/conversations-store`) + `projectId`.

Renders one card per conversation (skip ones already `status==="dismissed"`):
- Header: title → links to `threadUrl` (target=_blank rel=noreferrer); a meta line `r/{subreddit} · {age} · ▲{upVotes} · {numComments} comments` (use `viz.tsx` `formatCompact`/"—" for nulls; derive age from `postedAt`).
- **"Why this one":** `whyItMatters`.
- **Draft block:** if `draftReply.trim()` → a monospace/readonly block with the reply + a **Copy** button (`navigator.clipboard.writeText`); else the **"✍️ No draft — write your own"** note. If `draftable && promoRisk==="high"` → a small amber "review before posting" flag. Citations → a small list of the URLs.
- Actions: **Go to thread** (link), **Dismiss** and **Mark posted** buttons → `PATCH …/status` then `router.refresh()`.
- Honest states handled by the parent page (empty/loading); this renders a given list.

- [ ] **Step 1: Failing test** (jsdom, mock `next/navigation` `useRouter().refresh`, stub fetch): renders a card per non-dismissed conversation with title/why/subreddit; an empty-`draftReply` conversation shows the "write your own" note (NOT an empty block) and no Copy button; a non-empty `promoRisk:"high"` shows both the reply AND the review flag; clicking **Dismiss** PATCHes `…/{id}/status` with `{status:"dismissed"}` and calls `router.refresh`; the Copy button calls `navigator.clipboard.writeText` with the draft (stub clipboard).
- [ ] **Step 2: Run → FAIL** · **Step 3: Implement.** · **Step 4: PASS** · **Step 5: Commit** `feat(reddit): conversations-worth-joining cards (copy draft, citations, dismiss/posted)`

---

## Task 6: `RedditBriefEditor` (Settings)

**Files:** Create `src/components/reddit-brief-editor.tsx`; Test `tests/components/reddit-brief-editor.test.tsx` (jsdom).

Mirror `settings-form.tsx`/`profile-review.tsx` (client component, own `/api` route, then `router.refresh()`). Props: `projectId`, initial `knowledgeBrief` + `subreddits` (server-fetched). A textarea for the brief + a simple editable subreddit list (comma/newline-split input); **Save** → `PUT /api/projects/[id]/reddit-config` → `router.refresh()`; honest saving/saved/error states. A short helper line explaining the brief grounds the drafted replies.

- [ ] **Step 1: Failing test** (jsdom): renders the seeded brief + subreddits; editing + Save PUTs `{knowledgeBrief, subreddits}` to `/api/projects/<id>/reddit-config` and calls `router.refresh`; a save error shows an honest message, not a false "saved". **Step 2–4:** RED → implement → GREEN. **Step 5: Commit** `feat(reddit): settings editor for the knowledge & voice brief + subreddits`

---

## Task 7: wire the Trends + Settings pages

**Files:** Rewrite `src/app/(app)/trends/page.tsx`; Modify `src/app/(app)/settings/page.tsx`.

- **Trends** (server component; keep `getCurrentProject`/`force-dynamic`): gate `Boolean(env.APIFY_API_KEY)` — absent → a configure state ("Reddit Conversations needs an Apify key"). Else read `listLatestConversations(db, project.id, 20)` + `getRedditConfig` and render a heading, `<RunConversationsScanButton projectId>`, and either `<RedditConversations conversations projectId>` or an `<EmptyState>` ("No conversations yet — run a scan"). Remove all old-radar imports/usage.
- **Settings:** fetch `getRedditConfig(db, project.id)` and mount `<RedditBriefEditor projectId knowledgeBrief subreddits>` in a new section (mirror where CompetitorManager/ProfileReview mount).

- [ ] **Step 1:** Implement both. Update `tests/components/app-nav.test.tsx` only if it asserts a count (Trends label stays "Trends"). · **Step 2: Gate** `pnpm exec tsc --noEmit && pnpm exec vitest run && NODE_OPTIONS=--max-old-space-size=4096 pnpm build` all green. · **Step 3: Commit** `feat(reddit): trends tab becomes "conversations worth joining" + settings brief editor`

---

## Task 8: retire the old SerpApi radar (cutover)

**Files:** Delete `src/components/reddit-radar.tsx`, `src/components/run-reddit-radar-button.tsx`, `src/app/api/projects/[id]/reddit-radar/` (route), `src/lib/reddit/{serpapi,radar,relevance,daily,store}.ts` and their tests; remove the `case "reddit_radar_scan"` + `redditRadarHandler` import from `worker/index.ts` and the `redditRadarHandler` file. Leave the `reddit_radar_snapshots` table + its `schema.ts` entry (dormant).

- [ ] **Step 1:** `rg -n "reddit-radar|redditRadar|reddit_radar_scan|getLatestRadar|runDailyRedditRadar|lib/reddit/serpapi|lib/reddit/radar|lib/reddit/relevance|lib/reddit/daily\b|lib/reddit/store\b"` across `src/` + `worker/` to enumerate EVERY reference. Remove the components/routes/handlers/libs listed above and every dangling import.
- [ ] **Step 2:** `pnpm exec tsc --noEmit && pnpm exec vitest run && NODE_OPTIONS=--max-old-space-size=4096 pnpm build` — ALL green (the compiler is the safety net: a missed reference fails tsc/build). If a genuinely-shared helper turns out to be imported elsewhere, keep it and note it.
- [ ] **Step 3: Commit** `chore(reddit): retire the superseded serpapi radar (ui, route, handler, libs)`

---

## Task 9: Live verification (the "done" gate)

**No app code.** Deploy + real-browser E2E (the backend is already live-verified; this proves the UI).

- [ ] **Step 1: Deploy** (rsync + `docker compose build seo-web` + `up -d seo-web seo-worker`; no new migration).
- [ ] **Step 2: Browser E2E** (Kimi WebBridge, the owner's Brave, authenticated) on `https://seo-web.supergenius.cloud/trends`: the **Conversations worth joining** cards render (the 5 from the live scan) with copyable drafts + citations + Go-to-thread; **Copy** copies the draft; **Dismiss** removes a card (status persists on refresh); **Refresh** enqueues a scan and the button polls to done; in **Settings**, the knowledge-brief + subreddits editor shows the seeded values, and an edit + Save persists (re-open shows the change). Record the result. Only then is Plan 2 done.

---

## Self-review

**Spec coverage (design §10):** cards with thread/why/draft/citations/actions → Task 5; knowledge-brief + subreddits editor → Task 6; on-demand Refresh → Tasks 3–4; APIFY gate + configure state → Task 7; retire old radar (cutover) → Task 8; plus the subreddit-timeout tuning → Task 1. Live browser gate → Task 9.
**Placeholder scan:** none — each task has a concrete contract + test; boilerplate-heavy pieces (routes, run-button) name the exact sibling to mirror (`refresh/route.ts`, `run-gsc-sync-button.tsx`, `settings-form.tsx`) rather than restating their code.
**Type consistency:** `StoredConversation`/`updateConversationStatus`/`getRedditConfig`/`saveRedditConfig`/`listLatestConversations` are the Plan-1 contracts, consumed unchanged. The scan route enqueues the existing `reddit_conversations_scan` job type. The status route's `status` union matches the store fn.
