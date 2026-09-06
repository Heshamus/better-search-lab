# Reddit "Conversations Worth Joining" — Plan 1: Backend Pipeline + Daily Email

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the daily backend engine that, per project, scrapes Reddit (Apify), selects the 3–5 best conversations to join, drafts a grounded non-promotional reply for each, stores them, and emails the digest. No UI in this plan (that's Plan 2) — the deliverable is a working, live-verifiable daily scan + morning email.

**Architecture:** A pipeline of small, injectable units — `scrapeReddit` (Apify) → `prefilterPosts` (pure) → dedup → `judgeConversations` (DeepSeek fit+edge) → top 5 → `draftReply` (Perplexity web facts + DeepSeek) → store → `buildConversationsEmail` → `sendEmail`. Orchestrated by `runDailyConversationRadar` from the worker's existing daily `run()`, plus an on-demand `reddit_conversations_scan` job. The per-project **knowledge & voice brief** (auto-seeded, stored) grounds the judge + draft.

**Tech stack:** TypeScript, Drizzle ORM (+ `postgres`), Apify REST (`trudax~reddit-scraper`), Eden AI (Perplexity `sonar`), DeepSeek, Resend, vitest (pglite for DB, jsdom N/A here). Full design: `docs/superpowers/specs/2026-08-06-reddit-conversations-design.md`.

## Global Constraints

- **Draft-only.** No Reddit posting integration anywhere. The human posts.
- **Feature gated on `APIFY_API_KEY`** — absent → the daily pass no-ops and stores nothing (like `runWeeklyAiVisibility` gating on `EDENAI_API_KEY`).
- **Honesty:** a failed/parse-error judge yields `keep:false` (NEVER surface an unjudged thread); a failed draft stores the conversation with `draftReply:""` + `promoRisk:"high"` and a "write your own" note (NEVER a fabricated reply); Perplexity citations are stored and shown.
- **Apify full-scrape mode** — request post + top comments so `upVotes`/`numberOfComments` are populated (the fast RSS mode omits them).
- **Cost:** bounded candidate `maxItems`, top-5 ceiling; log Apify/Perplexity/DeepSeek usage via `logApiUsage` (account-level, no projectId).
- **Reuse, don't rebuild:** `EdenClient` (Perplexity), `DeepSeekClient`, `sendEmail`, `fetchSite`, the job queue (`runJob`/`resolveHandler`/`enqueueJob`), the daily `run()` hook, `logApiUsage`.
- **Schema:** add tables to `src/db/schema.ts`, then `pnpm db:generate` (drizzle-kit) to emit the next `src/db/migrations/NNNN_*.sql`; DB tests use pglite pushSchema so they pick up `schema.ts` directly.
- **Commits:** conventional, lowercase subject, `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. No `git push`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/config/env.ts` (modify) | `APIFY_API_KEY?`, `APIFY_REDDIT_ACTOR?` |
| `src/lib/reddit/apify.ts` (new) | `scrapeReddit()` → `RedditPost[]` (run-sync actor call + mapping) |
| `src/lib/reddit/prefilter.ts` (new, pure) | `prefilterPosts()` — fresh / question / not-saturated |
| `src/lib/reddit/reddit-config.ts` (new) | store: get/save per-project `knowledgeBrief` + `subreddits` |
| `src/lib/reddit/knowledge-brief.ts` (new) | `seedKnowledgeBrief()` + `suggestSubreddits()` (DeepSeek + crawl) |
| `src/lib/reddit/judge.ts` (new) | `judgeConversations()` — DeepSeek fit+edge, keep+rank |
| `src/lib/reddit/draft.ts` (new) | `draftReply()` — Perplexity facts + DeepSeek, guardrailed |
| `src/lib/reddit/conversations-store.ts` (new) | save / listLatest / seenUrls (dedup) |
| `src/lib/reddit/email.ts` (new, pure) | `buildConversationsEmail()` |
| `src/lib/reddit/daily-conversations.ts` (new) | `runDailyConversationRadar()` + `scanProjectConversations()` |
| `src/lib/jobs/handlers/reddit-conversations.ts` (new) | `reddit_conversations_scan` handler |
| `src/db/schema.ts` (modify) | `projectRedditConfig`, `redditConversations` tables |
| `worker/index.ts` (modify) | register handler; swap `runDailyRedditRadar` → `runDailyConversationRadar` |
| `scripts/probe-apify-reddit.ts` (new) | live shape probe (Task 11) |

Types live in `apify.ts` (`RedditPost`) and are imported downstream.

---

## Task 1: env — Apify keys

**Files:** Modify `src/config/env.ts`; Test `tests/config/env.test.ts` (extend existing).

**Interfaces produced:** `env.APIFY_API_KEY?: string`, `env.APIFY_REDDIT_ACTOR?: string`.

- [ ] **Step 1: Failing test** — add to the env suite:

```ts
it("accepts optional Apify config", () => {
  const env = loadEnv({ ...baseValidEnv, APIFY_API_KEY: "apify_xxx", APIFY_REDDIT_ACTOR: "trudax~reddit-scraper" });
  expect(env.APIFY_API_KEY).toBe("apify_xxx");
  expect(env.APIFY_REDDIT_ACTOR).toBe("trudax~reddit-scraper");
});
it("omits Apify config when absent", () => {
  const env = loadEnv(baseValidEnv);
  expect(env.APIFY_API_KEY).toBeUndefined();
});
```
(Reuse the file's existing `baseValidEnv`/valid-env helper; if none, build the minimal valid object the other tests use.)

- [ ] **Step 2: Run → FAIL** `pnpm exec vitest run tests/config/env.test.ts`

- [ ] **Step 3: Implement** — in the zod schema (after `SERPAPI_API_KEY`):
```ts
  // Optional: enables the Reddit "conversations worth joining" engine (Apify).
  // Absent → the daily conversation pass no-ops.
  APIFY_API_KEY: z.string().optional(),
  APIFY_REDDIT_ACTOR: z.string().optional(),
```

- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat(reddit): add optional APIFY_API_KEY/APIFY_REDDIT_ACTOR env`

---

## Task 2: Apify client — `scrapeReddit`

**Files:** Create `src/lib/reddit/apify.ts`; Create fixture `src/lib/reddit/fixtures/apify-reddit-live.json`; Test `tests/lib/reddit/apify.test.ts`.

**Interfaces produced:**
```ts
export interface RedditPost {
  id: string; title: string; body: string; url: string; subreddit: string;
  upVotes: number | null; numComments: number | null; createdAt: string;
  topComments: { body: string; upVotes: number | null }[];
}
export async function scrapeReddit(
  cfg: { apiKey: string; actor?: string; fetchImpl?: typeof fetch },
  input: { searches?: string[]; subredditUrls?: string[]; sort?: "New" | "Top" | "Comments" | "Relevance"; time?: "day" | "week"; maxItems?: number },
): Promise<RedditPost[]>;
```

> **Fixture note:** Apify's exact field names + the flag that turns on engagement fields are **confirmed live in Task 11** (the probe requires `APIFY_API_KEY`, provisioned at deploy). For now the fixture mirrors Apify's *documented* item shape (`body`, `upVotes`, `numberOfComments`, `createdAt`, `url`, `communityName`, `comments[]`). Task 11 corrects the mapper/fixture if the live shape differs.

- [ ] **Step 1: Create the fixture** `src/lib/reddit/fixtures/apify-reddit-live.json` — an array of 2 documented-shape items: one rich post (body, `upVotes`, `numberOfComments`, `createdAt`, `url` like `https://www.reddit.com/r/SEO/comments/abc/...`, `communityName:"r/SEO"`, `comments:[{body,upVotes}]`) and one link/image post (empty `body`, null-ish engagement) to exercise defensive mapping.

- [ ] **Step 2: Failing test**
```ts
import { describe, it, expect } from "vitest";
import fixture from "@/lib/reddit/fixtures/apify-reddit-live.json";
import { scrapeReddit, type RedditPost } from "@/lib/reddit/apify";

const client = (items: unknown) => async () =>
  ({ ok: true, status: 200, json: async () => items }) as unknown as Response;

describe("scrapeReddit", () => {
  it("maps Apify items to RedditPost, normalizing subreddit + engagement + comments", async () => {
    const posts = await scrapeReddit(
      { apiKey: "k", fetchImpl: client(fixture) as any },
      { searches: ["seo audit"], time: "week", maxItems: 50 },
    );
    expect(posts.length).toBe(2);
    const p = posts[0];
    expect(p.subreddit).toBe("SEO");           // "r/" stripped
    expect(typeof p.upVotes === "number" || p.upVotes === null).toBe(true);
    expect(Array.isArray(p.topComments)).toBe(true);
    expect(p.url).toContain("reddit.com");
  });
  it("POSTs to the run-sync-get-dataset-items endpoint with the token + input", async () => {
    let seen: any = null;
    const fetchImpl = (async (url: string, opts: any) => { seen = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200, json: async () => [] }; }) as any;
    await scrapeReddit({ apiKey: "tok", actor: "trudax~reddit-scraper", fetchImpl }, { searches: ["x"], maxItems: 10 });
    expect(seen.url).toContain("/acts/trudax~reddit-scraper/run-sync-get-dataset-items");
    expect(seen.url).toContain("token=tok");
    expect(seen.body.searches).toEqual(["x"]);
  });
  it("returns [] (fail-soft) on a non-ok response", async () => {
    const posts = await scrapeReddit({ apiKey: "k", fetchImpl: (async () => ({ ok: false, status: 500, text: async () => "err" })) as any }, { searches: ["x"] });
    expect(posts).toEqual([]);
  });
});
```

- [ ] **Step 3: Run → FAIL**

- [ ] **Step 4: Implement** — build the URL `https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items?token={apiKey}` (actor default `trudax~reddit-scraper`); POST the input mapped to the actor's schema (searches, startUrls from `subredditUrls`, sort, time, `maxItems`/`maxPostCount`, **full-scrape flags for engagement + a few comments**); `AbortSignal.timeout(120_000)`; on `!ok` or throw → log + return `[]`; map each item defensively to `RedditPost` (strip `r/` from `communityName`; `numberOfComments`→`numComments`; take up to 5 `comments`).

- [ ] **Step 5: Run → PASS**; **Step 6: Commit** `feat(reddit): apify reddit scraper client (scrapeReddit) with fail-soft mapping`

---

## Task 3: `prefilterPosts` (pure)

**Files:** Create `src/lib/reddit/prefilter.ts`; Test `tests/lib/reddit/prefilter.test.ts`.

**Interfaces:** consumes `RedditPost`; produces `prefilterPosts(posts, { now, maxAgeHours?, maxComments?, minChars? }): RedditPost[]`.

- [ ] **Step 1: Failing test** — cover: drops stale (`createdAt` older than `maxAgeHours` default 72), drops saturated (`numComments` > `maxComments` default 40), keeps a fresh short-title question (`title` ends "?"), keeps a fresh post with body ≥ `minChars` (default 80), drops a fresh non-question link post with empty body, keeps a brand-new post with 0 comments (no hard min). Build `RedditPost` factory inline.

- [ ] **Step 2: Run → FAIL** · **Step 3: Implement**:
```ts
export function prefilterPosts(posts: RedditPost[], opts: { now: number; maxAgeHours?: number; maxComments?: number; minChars?: number }): RedditPost[] {
  const maxAge = (opts.maxAgeHours ?? 72) * 3600_000, maxC = opts.maxComments ?? 40, minChars = opts.minChars ?? 80;
  return posts.filter((p) => {
    const age = opts.now - Date.parse(p.createdAt);
    if (!(age >= 0 && age <= maxAge)) return false;                 // fresh, valid date
    if ((p.numComments ?? 0) > maxC) return false;                  // not saturated
    const isQuestion = /\?\s*$/.test(p.title) || p.body.trim().length >= minChars;
    return isQuestion;                                              // a real discussion
  });
}
```
- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat(reddit): pure prefilterPosts (fresh/question/not-saturated)`

---

## Task 4: reddit-config storage (knowledge brief + subreddits)

**Files:** Modify `src/db/schema.ts` (+ generate migration); Create `src/lib/reddit/reddit-config.ts`; Test `tests/lib/reddit/reddit-config.test.ts` (pglite).

**Interfaces produced:** `getRedditConfig(db, projectId): Promise<{ knowledgeBrief: string | null; subreddits: string[] }>`; `saveRedditConfig(db, projectId, { knowledgeBrief?, subreddits? }): Promise<void>`.

- [ ] **Step 1:** Add to `schema.ts` (mirror `redditRadarSnapshots` style):
```ts
export const projectRedditConfig = pgTable("project_reddit_config", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  knowledgeBrief: text("knowledge_brief"),
  subreddits: jsonb("subreddits").$type<string[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```
- [ ] **Step 2:** `pnpm db:generate` → new `src/db/migrations/NNNN_*.sql`; verify it `CREATE TABLE`s `project_reddit_config` and commit the SQL with the code.
- [ ] **Step 3: Failing test** (pglite `createTestDb`): save then get returns the brief + subreddits; get on an unseeded project returns `{ knowledgeBrief: null, subreddits: [] }`; save is upsert (second save overwrites).
- [ ] **Step 4: Run → FAIL** · **Step 5: Implement** `reddit-config.ts` (drizzle upsert `onConflictDoUpdate` on `projectId`). · **Step 6: Run → PASS** · **Step 7: Commit** `feat(reddit): project_reddit_config table + get/save store`

---

## Task 5: knowledge-brief auto-seed + subreddit suggestion

**Files:** Create `src/lib/reddit/knowledge-brief.ts`; Test `tests/lib/reddit/knowledge-brief.test.ts`.

**Interfaces produced:**
```ts
export async function ensureKnowledgeBrief(deps: {
  db: any; projectId: string; domain: string;
  chat: (m: ChatMessage[]) => Promise<string>;
  crawl?: () => Promise<string>;   // returns a plain-text summary of key pages
}): Promise<{ brief: string; subreddits: string[] }>;
```

- [ ] **Step 1: Failing test** (stub `chat` + `crawl` + a pglite db): when config is empty, `ensureKnowledgeBrief` calls `chat` to generate a brief + subreddits, saves them (via `saveRedditConfig`), and returns them; when config already has a brief, it returns the stored one WITHOUT calling `chat` (idempotent). Assert the DeepSeek prompt (captured from the `chat` stub) includes the domain + the crawl summary text.

- [ ] **Step 2: Run → FAIL** · **Step 3: Implement:** read `getRedditConfig`; if `knowledgeBrief` present → return it. Else: build a plain-text site summary (`crawl()` if provided — strip HTML from `fetchSite` pages to ~2–3k chars), call `chat` with a system prompt: *"Summarize what this company does, the credible expertise it can speak to, concrete facts it can cite, and the tone it should strike on Reddit — plus 5–10 subreddits where its audience discusses these topics. Return JSON {brief, subreddits}."* Parse defensively (JSON, fallback to empty subreddits). `saveRedditConfig`. Return.

- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat(reddit): auto-seed knowledge & voice brief + subreddit suggestions`

---

## Task 6: fit+edge judge

**Files:** Create `src/lib/reddit/judge.ts`; Test `tests/lib/reddit/judge.test.ts`.

**Interfaces produced:**
```ts
export interface Judgement { url: string; fit: number; edge: number; whyItMatters: string; keep: boolean }
export async function judgeConversations(posts: RedditPost[], deps: { brief: string; chat: (m: ChatMessage[]) => Promise<string> }): Promise<Judgement[]>;
```

- [ ] **Step 1: Failing test** (stub `chat` returning canned JSON): given 3 posts, returns judgements keyed by url; applies `keep = fit >= 0.5 && edge >= 0.6`; sorts kept by `edge` desc; **a `chat` that throws or returns unparseable JSON → all `keep:false`** (never surface unjudged); assert the prompt includes the brief + each post's title/body.

- [ ] **Step 2: Run → FAIL** · **Step 3: Implement:** one batched `chat` call — system prompt instructs scoring `fit` (0–1, our wheelhouse) and `edge` (0–1, *can we add value not already in the thread?* given the brief + the post's existing top comments) + a one-line `whyItMatters`, returning a JSON array. Parse defensively; on any error → map every input post to `{keep:false}`. Compute `keep`, return sorted by `edge` desc. (Caller takes `.filter(j=>j.keep).slice(0,5)`.)

- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat(reddit): DeepSeek fit+edge conversation judge (fail-closed)`

---

## Task 7: reply drafter

**Files:** Create `src/lib/reddit/draft.ts`; Test `tests/lib/reddit/draft.test.ts`.

**Interfaces produced:**
```ts
export interface Draft { reply: string; citations: string[]; promoRisk: "low" | "medium" | "high" }
export async function draftReply(post: RedditPost, deps: {
  brief: string;
  ask?: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>; // Perplexity
  chat: (m: ChatMessage[]) => Promise<string>;
}): Promise<Draft>;
```

- [ ] **Step 1: Failing test** (stub deps): happy path → `ask` (Perplexity) is called for web facts, `chat` drafts a reply, returns `{reply, citations, promoRisk}` with the Perplexity citations; **`ask` absent/throws → still drafts from brief+post, `citations:[]`** (don't block); **`chat` throws → `{reply:"", citations:[], promoRisk:"high"}`** (never fabricate); assert the draft prompt contains the brief, the post body, the top comments, and (when present) the web facts, and that it instructs *non-promotional, value-first, link only if natural, match subreddit tone*.

- [ ] **Step 2: Run → FAIL** · **Step 3: Implement:** (1) if `ask` present, `ask("perplexityai/sonar", <thread-topic question>)` → `{answer, citations}` (catch → `{answer:"",citations:[]}`); (2) `chat` with the guardrail system prompt + brief + post + top comments + web facts + a final line to self-rate `promoRisk`; parse the reply + promoRisk (default `medium`); on `chat` throw → the honest empty/high draft.

- [ ] **Step 4: Run → PASS**; **Step 5: Commit** `feat(reddit): perplexity-grounded, guardrailed reply drafter`

---

## Task 8: conversations storage + dedup

**Files:** Modify `src/db/schema.ts` (+ migration); Create `src/lib/reddit/conversations-store.ts`; Test `tests/lib/reddit/conversations-store.test.ts` (pglite).

**Interfaces produced:** `StoredConversation` type; `saveConversations(db, projectId, scanDate, rows): Promise<void>`; `listLatestConversations(db, projectId, limit): Promise<StoredConversation[]>`; `seenThreadUrls(db, projectId): Promise<Set<string>>`.

- [ ] **Step 1:** Add `redditConversations` to `schema.ts`:
```ts
export const redditConversations = pgTable("reddit_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  scanDate: date("scan_date").notNull(),
  threadUrl: text("thread_url").notNull(),
  subreddit: text("subreddit").notNull().default(""),
  title: text("title").notNull().default(""),
  upVotes: integer("up_votes"), numComments: integer("num_comments"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  whyItMatters: text("why_it_matters").notNull().default(""),
  draftReply: text("draft_reply").notNull().default(""),
  citations: jsonb("citations").$type<string[]>().default([]).notNull(),
  promoRisk: text("promo_risk").notNull().default("medium"),
  status: text("status").notNull().default("new"),
  insertedAt: timestamp("inserted_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("reddit_conversations_project_url_idx").on(t.projectId, t.threadUrl)]);
```
- [ ] **Step 2:** `pnpm db:generate`; verify + commit the SQL.
- [ ] **Step 3: Failing test** (pglite): save N rows then `listLatestConversations` returns them newest-first capped at limit; `seenThreadUrls` returns the set of stored urls; saving a duplicate `(projectId, threadUrl)` is a no-op/ignore (dedup — use `onConflictDoNothing`).
- [ ] **Step 4: Run → FAIL** · **Step 5: Implement** (drizzle insert `onConflictDoNothing` on the unique index; select ordered by `insertedAt desc`). · **Step 6: Run → PASS** · **Step 7: Commit** `feat(reddit): reddit_conversations table + store with url dedup`

---

## Task 9: email builder (pure)

**Files:** Create `src/lib/reddit/email.ts`; Test `tests/lib/reddit/email.test.ts`.

**Interfaces produced:** `buildConversationsEmail({ domain, conversations, appUrl? }): { subject; html; text }`.

- [ ] **Step 1: Failing test:** subject like `3 Reddit conversations worth joining — <domain>`; html+text each contain, per conversation: subreddit, `whyItMatters`, the draft reply, the thread link, and the citations; a `promoRisk:"high"`/empty-draft row renders a "write your own" note instead of a fake reply; HTML-escapes titles/replies; empty list → a "nothing worth joining today" body. Mirror `report.ts`'s `esc()` + inline-style approach.

- [ ] **Step 2: Run → FAIL** · **Step 3: Implement** (pure string builder, inline styles, `esc()` from the report pattern). · **Step 4: Run → PASS** · **Step 5: Commit** `feat(reddit): buildConversationsEmail digest (html+text)`

---

## Task 10: daily orchestration + job handler + worker wiring

**Files:** Create `src/lib/reddit/daily-conversations.ts`; Create `src/lib/jobs/handlers/reddit-conversations.ts`; Modify `worker/index.ts`; Test `tests/lib/reddit/daily-conversations.test.ts`.

**Interfaces produced:**
```ts
export async function scanProjectConversations(deps: { db; projectId; domain; env; scrape; ask; chat }): Promise<StoredConversation[]>;
export async function runDailyConversationRadar(deps: { db; now: Date; env; scrape; ask; chat; sendEmailImpl? }): Promise<{ scanned: string[]; emailed: string[] }>;
```

- [ ] **Step 1: Failing test** (all deps stubbed, pglite db): `scanProjectConversations` runs gather(`scrape`)→`prefilterPosts`→ drop `seenThreadUrls` → `judgeConversations`→ top-5 kept → `draftReply` each → `saveConversations`, and returns the stored rows; a thread already in `seenThreadUrls` is excluded; `runDailyConversationRadar` no-ops when `env.APIFY_API_KEY` absent; for a due project it scans + calls `sendEmailImpl` with the built digest; email failure still leaves conversations stored. Assert `logApiUsage` called (cost logged, no projectId).

- [ ] **Step 2: Run → FAIL** · **Step 3: Implement:**
  - `scanProjectConversations`: load `getRedditConfig` (+ `ensureKnowledgeBrief` if brief empty), build terms (tracked keywords + GSC rising/top — reuse the existing radar's term derivation) + `subredditUrls`, `scrape`, `prefilterPosts`, drop `seenThreadUrls`, `judgeConversations`, `.filter(keep).slice(0,5)`, `draftReply` each (with `ask`), map to rows, `saveConversations`; `logApiUsage` for apify/perplexity/deepseek. Fail-soft per project.
  - `runDailyConversationRadar`: gate on `APIFY_API_KEY`; self-healing (skip projects scanned < ~20h ago — reuse the radar's recency check); scan each due project; `buildConversationsEmail` + `sendEmail` (best-effort) when there's ≥1 conversation.
  - Handler `reddit_conversations_scan` → `scanProjectConversations` for `ctx.projectId` (no email).
  - `worker/index.ts`: `import`; add `case "reddit_conversations_scan": return redditConversationsHandler();` to `resolveHandler`; **replace** the `runDailyRedditRadar({...})` call in `run()` with `runDailyConversationRadar({ db, now: new Date(), env, scrape: (i)=>scrapeReddit({apiKey:env.APIFY_API_KEY!, actor:env.APIFY_REDDIT_ACTOR}, i), ask: (m,p)=>new EdenClient(env.EDENAI_API_KEY!).ask(m,p), chat: (msgs)=>new DeepSeekClient({apiKey:env.DEEPSEEK_API_KEY!}).chat(msgs) })`.

- [ ] **Step 4: Run → PASS** · **Step 5:** `pnpm exec tsc --noEmit && pnpm exec vitest run && NODE_OPTIONS=--max-old-space-size=4096 pnpm build` all green. · **Step 6: Commit** `feat(reddit): daily conversation radar orchestration + job handler + worker wiring`

---

## Task 11: Live verification (the "done" gate)

**No app code.** LIVE-VERIFICATION MANDATE. Requires the owner to provision `APIFY_API_KEY` in `/opt/seo-platform/.env` (usage-priced Apify account).

- [ ] **Step 1: Probe Apify live** — `scripts/probe-apify-reddit.ts` (loads env, calls `scrapeReddit` for one term + one subreddit); run in the deployed container. **Confirm** items carry `body`, `upVotes`, `numberOfComments`, `createdAt`, and comments, and confirm the input flags that turn engagement on (RSS-mode caveat). If the live field names differ from the fixture, **fix `apify.ts` mapper + the fixture, re-run Task 2's tests.**
- [ ] **Step 2: Deploy** (rsync + `docker compose build seo-web seo-worker` + `up -d`; run `pnpm db:migrate` for the two new tables).
- [ ] **Step 3: Live E2E** — enqueue a `reddit_conversations_scan` for Northwind.io; confirm it stores 1–5 real, fresh, on-topic conversations with sensible `whyItMatters` and a draft that reads genuinely useful + non-promotional + carries real Perplexity citations. Trigger `runDailyConversationRadar` and confirm the **email arrives** with the digest. Record the result. Only now is Plan 1 done.

---

## Self-review

**Spec coverage:** Apify source (T2) · prefilter (T3) · knowledge brief memory (T4/T5) · fit+edge judge (T6) · Perplexity-grounded guardrailed draft (T7) · storage+dedup (T8) · email (T9) · daily pass + on-demand + cron swap + cost log (T10) · gating on `APIFY_API_KEY` (T1/T10) · honesty/fail modes (T6/T7/T9) · live gate incl. Apify shape probe (T11). UI + knowledge-brief editor are **Plan 2** (out of scope here) — the brief is auto-seeded so the pipeline works without the editor.

**Placeholder scan:** none — each step has real code/contract + tests. The single deferred concrete (Apify's exact engagement flag/field names) is an explicit live-probe in T11 with the documented shape used until then.

**Type consistency:** `RedditPost` (T2) flows through prefilter (T3), judge (T6, keyed by `url`), draft (T7), store (T8, `StoredConversation`), email (T9), orchestration (T10). `ChatMessage` (DeepSeek) and `ask`→`{answer,citations}` (Eden) match the real client signatures. `getRedditConfig`/`saveRedditConfig` (T4) consumed by T5/T10. `buildConversationsEmail` (T9) consumed by T10.
