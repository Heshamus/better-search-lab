# Reddit "Conversations Worth Joining" — design spec

**Date:** 2026-08-06
**Status:** Approved (design), pending implementation plan
**App:** Better Search Lab (seo-platform)

## Goal

Evolve the existing Reddit trend radar into an **engagement co-pilot**: each morning,
per project, surface the **3–5 Reddit conversations most worth joining** and, for each,
a **DeepSeek-drafted, non-promotional reply** grounded in (a) what the project actually
knows and (b) real web facts (Perplexity, with citations). Deliver them in the app **and**
as a **daily email digest**. The human reads, tweaks, and posts — we never auto-post.

The hard problem this targets (owner's words): *finding the very best threads where a
thoughtful reply would genuinely fit and add value.*

## What it delivers (per project, daily)

1. 3–5 conversations, each with: the thread (title, subreddit, age, score, #comments), a
   one-line **why it made the cut**, a **ready-to-copy draft reply** with its web citations,
   and a **Go to thread** link.
2. A **morning email** with the same list, sent when the daily run finishes.
3. A per-project **knowledge & voice brief** (the "memory of what the project is about")
   that the owner can curate and that every draft draws from.

## Non-goals (YAGNI)

- **No auto-posting to Reddit.** Draft-only; the human posts. (Hard rule + correct for Reddit.)
- **No full RAG / site-content index in v1.** The knowledge brief carries the "our website"
  knowledge; per-thread retrieval of site pages is a documented later upgrade (Option C).
- **Reddit only.** No HN/Quora/X expansion (owner explicitly excluded HN earlier).
- **Not real-time.** Daily cadence (self-healing), with an on-demand "Refresh" trigger.
- **No engagement analytics** (did the reply land?) in v1.

## Relationship to the existing radar (supersede + reuse)

The current radar (`src/lib/reddit/{serpapi,radar,relevance,daily,store}.ts`, the
`reddit_radar_scan` job, `reddit_radar_snapshots`, `reddit-radar.tsx`, the Trends page) is
**superseded**: the data source changes from SerpApi-Google (title/snippet only) to Apify
(full post + engagement), and selection/drafting/email are new. We **keep** the daily-cron
hook shape, the DeepSeek relevance-judge *idea* (evolved into a fit+edge judge), the Resend
email pattern, and the Trends nav slot (its view is replaced). The old SerpApi reddit path is
removed once the new engine is live-verified. SerpApi's Reddit engine is gone (delisted amid
Reddit v. SerpApi), so there is no fallback there.

## Architecture — small, testable units

### 1. Apify Reddit client — `src/lib/reddit/apify.ts` (new)

```ts
export interface RedditPost {
  id: string;
  title: string;
  body: string;                 // selftext ("" if link/image post)
  url: string;                  // full permalink
  subreddit: string;            // normalized, no "r/" prefix
  upVotes: number | null;
  numComments: number | null;
  createdAt: string;            // ISO 8601
  topComments: { body: string; upVotes: number | null }[]; // up to ~5, for context
}

export async function scrapeReddit(
  cfg: { apiKey: string; actor?: string; fetchImpl?: typeof fetch },
  input: { searches?: string[]; subredditUrls?: string[]; sort?: "New" | "Top" | "Comments" | "Relevance"; time?: "day" | "week"; maxItems?: number },
): Promise<RedditPost[]>;
```

- Calls `POST https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token=…`
  (`actor` default `trudax~reddit-scraper`), body = the Apify input. Runs the actor to
  completion and returns the dataset items in one request. `AbortSignal.timeout(120_000)`.
- **Must use the full-scrape mode, not the fast RSS feed** — engagement fields (`upVotes`,
  `numberOfComments`) are only populated in full mode. Set the actor input accordingly
  (`skipComments:false`, request post + a few top comments; the exact flag is confirmed at
  build time against the live actor — see Airtight gate).
- Maps Apify item fields → `RedditPost` (`body`, `upVotes`, `numberOfComments`→`numComments`,
  `createdAt`, `url`, `communityName`/subreddit, comments→`topComments`). Defensive: any
  missing field → null / "".
- Fail-soft: a thrown/timeout call returns `[]` and is logged; the daily pass degrades to
  "no conversations today" rather than crashing.

### 2. Candidate gathering — `src/lib/reddit/gather.ts` (new)

Seeds two ways, both stored per project (see §7 config):
- **Niche terms** — from the project's tracked keywords + GSC rising/top queries (reuse the
  current radar's term derivation).
- **Relevant subreddits** — a per-project list (DeepSeek-suggested from the knowledge brief,
  owner-editable), scraped by `New`/`Top` in the last day/week.

`gatherCandidates(scrape, { terms, subredditUrls, ... })` → de-duplicated `RedditPost[]`
(dedupe by `url`). Bounded (`maxItems`) to cap Apify cost.

### 3. Cheap pre-filters — `src/lib/reddit/prefilter.ts` (new, pure)

```ts
export function prefilterPosts(
  posts: RedditPost[],
  opts: { now: number; maxAgeHours?: number; maxComments?: number; minChars?: number },
): RedditPost[];
```

No LLM. Keep posts that are: **fresh** (`createdAt` within `maxAgeHours`, default 72),
**a real question/discussion** (has a body of ≥ `minChars`, or a title ending in "?" /
question-shaped — heuristic), and **active-but-not-saturated** (`numComments` ≤ `maxComments`,
default ~40, so a reply isn't buried; no hard min so brand-new threads qualify). Pure and
fully unit-tested — this is the cheap gate before spending DeepSeek.

### 4. Fit + edge judge — `src/lib/reddit/judge.ts` (new, DeepSeek)

```ts
export interface Judgement { url: string; fit: number; edge: number; whyItMatters: string; keep: boolean }
export async function judgeConversations(
  posts: RedditPost[],
  deps: { brief: string; chat: (messages: ChatMessage[]) => Promise<string> },
): Promise<Judgement[]>;
```

One batched DeepSeek call over the shortlist: given the **knowledge brief** + each post's
title/body/top-comments, score **fit** (0–1, is this our wheelhouse) and — the make-or-break —
**edge** (0–1, *can we add something useful the thread doesn't already have?*), plus a
one-line `whyItMatters`. `keep = fit ≥ 0.5 && edge ≥ 0.6` (tunable). Fail-open on a parse
error is **not** allowed here (unlike relevance): a judge failure drops to `keep:false` so we
never surface an unjudged thread. Rank survivors by `edge` (tiebreak `fit`), take **top 5**.

### 5. Reply drafter — `src/lib/reddit/draft.ts` (new, Perplexity + DeepSeek)

```ts
export interface Draft { reply: string; citations: string[]; promoRisk: "low" | "medium" | "high" }
export async function draftReply(
  post: RedditPost,
  deps: { brief: string; ask: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>; chat: (messages: ChatMessage[]) => Promise<string> },
): Promise<Draft>;
```

Per kept conversation:
1. **Web-ground** — one Perplexity call (`EdenClient.ask("perplexityai/sonar", …)`) for
   current, cited facts on the thread's specific question → `{answer, citations}`.
2. **Draft** — DeepSeek with a strict prompt: the **knowledge brief** (our expertise/voice) +
   the **post** (+ top comments, so we don't repeat existing answers) + the **web facts**.
   Produces a reply that is value-first, factual, matches the subreddit's tone, and includes a
   link ONLY if genuinely natural. Returns the reply, the citations used, and a self-assessed
   `promoRisk`. A `high` promoRisk draft is still shown but flagged in the UI/email so the
   owner rewrites before posting.

### 6. Knowledge & voice brief — `src/lib/reddit/knowledge-brief.ts` + storage (new)

The "in-built memory of what each project is about." A per-project text block:
- **Auto-seeded** on first use by DeepSeek from the project profile + a crawl summary of the
  site's key pages (reuse `src/lib/crawl/fetch-site.ts`): *what the company does, its
  credible expertise, facts it can cite, and the tone to strike.*
- **Owner-editable** (a textarea in Settings) — this is the control surface for reply quality.
- Stored on the project (new column/table, §7). Every judge + draft call reads it.
- Same store holds the per-project **relevant-subreddit list** (DeepSeek-suggested, editable).

### 7. Storage + dedup — migration (new)

- `project_reddit_config` (or columns on `projects`): `knowledge_brief text`, `subreddits jsonb`.
- `reddit_conversations` — one row per surfaced conversation: `id, project_id, scan_date,
  thread_url (unique per project), subreddit, title, up_votes, num_comments, created_at,
  why_it_matters, draft_reply, citations jsonb, promo_risk, status ('new'|'dismissed'|'posted'),
  inserted_at`. **Dedup:** a thread already stored for the project (by `thread_url`) is never
  re-surfaced — the gather step drops URLs already in `reddit_conversations`.
- Retire `reddit_radar_snapshots` after cutover (or leave dormant; no new writes).

### 8. Daily pass + email — `src/lib/reddit/daily-conversations.ts` + `email.ts` (new)

Evolves `runDailyRedditRadar`. `runDailyConversationRadar(deps: { db, now, env, scrape, ask, chat })`:
for each due project (self-healing: not scanned in ~20h), run the pipeline
(gather → prefilter → judge → top 5 → draft each), store, then build + send the digest:

```ts
export function buildConversationsEmail(opts: { domain: string; conversations: StoredConversation[]; appUrl?: string }): { subject: string; html: string; text: string };
```

Reuse `sendEmail` (Resend). Subject e.g. `5 Reddit conversations worth joining — <domain>`.
Email lists each: subreddit · age · score, *why it matters*, the draft (in a monospace block),
citations, and a link to the thread + a link to the app. Email is **best-effort** (a Resend
failure still stores the conversations). Called from the worker's daily `run()` (replacing the
`runDailyRedditRadar` call).

### 9. Job handler + on-demand — `src/lib/jobs/handlers/reddit-conversations.ts` + `worker/index.ts`

- New job type `reddit_conversations_scan` registered in `resolveHandler`; runs the pipeline
  for one project (no email — email is the daily-pass digest).
- `POST /api/projects/[id]/reddit-conversations/scan` enqueues it (202 + jobId), for a
  "Refresh" button (reuse the async enqueue+poll pattern).
- The daily `run()` calls `runDailyConversationRadar(...)` (self-healing + email).

### 10. UI — Trends tab → "Conversations worth joining"

- `src/app/(app)/trends/page.tsx` + `src/components/reddit-conversations.tsx` (replaces
  `reddit-radar.tsx`): 3–5 **cards**, each: title (links to thread) · subreddit · age · score ·
  #comments; a **"Why this one"** line; the **draft reply** in a copyable block with a **Copy**
  button + its citations; a `promoRisk` badge; **Go to thread** button; and Dismiss/Mark-posted
  actions (update `status`). A **Refresh** button (enqueues the scan) + empty/loading/error states.
- **Settings:** a **Knowledge & voice brief** editor (textarea, auto-seeded, save) + the
  **relevant subreddits** editor.

### 11. Cost logging + env

- Log Apify + Perplexity + DeepSeek usage per run via the existing `logApiUsage` (account-level),
  so the Usage page reflects it. Bounded per run: ~1–3 Apify actor runs, ≤5 Perplexity, ≤~12 DeepSeek.
- `src/config/env.ts`: add `APIFY_API_KEY` (optional → feature off if absent) and
  `APIFY_REDDIT_ACTOR` (optional, default `trudax~reddit-scraper`). Reuse `EDENAI_API_KEY`
  (Perplexity), `DEEPSEEK_API_KEY`, `RESEND_*`, `APP_URL`.

## Data flow

```
niche terms + subreddit list
        │  (Apify: run-sync-get-dataset-items)         [§1,§2]
        ▼
   RedditPost[] (body, upVotes, numComments, createdAt, topComments)
        │  drop URLs already surfaced (dedup)           [§7]
        │  prefilter: fresh · question · not-saturated  [§3]  (pure, no LLM)
        ▼
   shortlist ──► DeepSeek fit+edge judge ──► keep, rank by edge, top 5   [§4]
        │
        ▼  for each kept:
   Perplexity web facts (+citations) + knowledge brief + post ──► DeepSeek draft   [§5]
        ▼
   store (reddit_conversations, dedup)  ──►  app cards  +  morning email digest   [§7,§8,§10]
```

## Guardrails

- **Draft-only** — no posting integration; the owner posts manually.
- **Non-promotional** — the draft prompt forbids sales language / gratuitous links; `promoRisk`
  self-check flags borderline drafts; UI/email badge them.
- **Honesty** — a failed judge never surfaces an unjudged thread (keep:false); a failed draft
  surfaces the conversation with a "draft unavailable — write your own" note, never a fabricated
  reply. Perplexity citations are shown so claims are checkable.
- **Cost caps** — bounded candidate count + top-5 ceiling; feature is off when `APIFY_API_KEY`
  is absent.

## Edge cases

- No Apify key → feature off (Settings shows "connect Apify"). · Apify returns 0 / errors →
  "no conversations today," nothing stored. · All candidates filtered out → empty state (honest).
- Perplexity down → draft from brief + post only, note "no web grounding" (don't block). ·
  DeepSeek down → conversation surfaced without a draft (see Honesty). · Dedup prevents
  re-surfacing yesterday's threads. · Very long post/comments → truncate before the LLM.

## Testing

Pure/unit (vitest, hermetic):
- `prefilterPosts` — age/question/saturation thresholds, boundaries.
- Apify item→`RedditPost` mapping (fixture from a real probe response — see gate).
- `judgeConversations` parse + keep/rank logic (fixture DeepSeek output; keep-threshold, judge-failure→drop).
- `draftReply` prompt assembly + fail modes (Perplexity-absent, DeepSeek-error) with stubbed deps.
- `buildConversationsEmail` — subject, per-conversation rows, citations, escaping.
- Dedup (drops already-stored URLs).

Component (jsdom): the conversations cards render; Copy button; Refresh enqueues; empty/error states.

## Airtight verification gate (LIVE-VERIFICATION MANDATE)

1. **Probe Apify live** (throwaway script, real `APIFY_API_KEY`) for one niche term + one
   subreddit; confirm the items include `body`, `upVotes`, `numberOfComments`, `createdAt`, and
   comments — and confirm which input flags are required to get engagement fields (RSS-mode
   caveat). Build the mapper fixture from that real response.
2. **Live E2E in the deployed env**: run one real scan for example-site.com → confirm it surfaces
   real, fresh, on-topic threads with sensible "why it matters," and a draft reply that reads as
   genuinely useful + non-promotional + carries real Perplexity citations. Confirm the **email**
   arrives with the list. Only then is it "done."

## Files

New: `src/lib/reddit/apify.ts`, `gather.ts`, `prefilter.ts`, `judge.ts`, `draft.ts`,
`knowledge-brief.ts`, `daily-conversations.ts`, `email.ts`; `src/lib/jobs/handlers/reddit-conversations.ts`;
`src/app/api/projects/[id]/reddit-conversations/scan/route.ts`; `src/components/reddit-conversations.tsx`;
a knowledge-brief/subreddits Settings editor; migration for `project_reddit_config` + `reddit_conversations`;
`scripts/probe-apify-reddit.ts`; test files.
Modified: `worker/index.ts` (swap `runDailyRedditRadar` → `runDailyConversationRadar`; register
`reddit_conversations_scan`), `src/config/env.ts` (`APIFY_API_KEY`, `APIFY_REDDIT_ACTOR`),
`src/app/(app)/trends/page.tsx`, `src/components/app-nav.tsx` (Trends label may stay), settings page.
Retire after cutover: `src/lib/reddit/{serpapi,radar,relevance,daily}.ts`, `reddit-radar.tsx`, `reddit_radar_snapshots`.
