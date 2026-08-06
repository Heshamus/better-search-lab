import { and, eq } from "drizzle-orm";
import { keywords, projects } from "@/db/schema";
import { getGscData } from "@/lib/google/store";
import { getRedditConfig } from "@/lib/reddit/reddit-config";
import { ensureKnowledgeBrief } from "@/lib/reddit/knowledge-brief";
import { prefilterPosts } from "@/lib/reddit/prefilter";
import { judgeConversations, type Judgement } from "@/lib/reddit/judge";
import { draftReply } from "@/lib/reddit/draft";
import {
  saveConversations,
  seenThreadUrls,
  listLatestConversations,
  type StoredConversation,
  type NewConversation,
} from "@/lib/reddit/conversations-store";
import { buildConversationsEmail } from "@/lib/reddit/email";
import { sendEmail } from "@/lib/email/resend";
import { logApiUsage, DEEPSEEK_CHAT_ENDPOINT } from "@/lib/dataforseo/cost";
import type { RedditPost } from "@/lib/reddit/apify";
import type { ChatMessage } from "@/lib/llm/deepseek";

// Orchestrates the per-project Reddit Conversations pipeline (this file) and
// the self-healing daily pass that runs it across every project + emails the
// digest. Evolves runDailyRedditRadar/runRedditRadar (src/lib/reddit/{daily,radar}.ts):
// same self-healing shape, new Apify-sourced, judge+draft pipeline.

const APIFY_ENDPOINT = "apify/reddit-scraper";
const PERPLEXITY_ENDPOINT = "eden/perplexity/sonar";
const MAX_KEPT = 5;
const SCRAPE_MAX_ITEMS = 50;

// Term derivation — ported from src/lib/jobs/handlers/reddit-radar.ts's `add()`
// closure (rising GSC queries first, then top, deduped + junk-filtered), plus
// the project's own tracked keywords (the design's "tracked keywords + GSC
// rising/top queries" niche-term source). Unlike the old radar, tracked
// keywords are real search terms here, not just relevance-filter context —
// this pipeline's judge (not a separate relevance pass) is what filters fit.
const MAX_TERMS = 15;
const normQ = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, " ");
const isJunk = (q: string): boolean => q.length > 90 || /\bsite:/i.test(q) || /["']/.test(q);

async function deriveSearchTerms(db: any, projectId: string): Promise<string[]> {
  const seen = new Set<string>();
  const terms: string[] = [];
  const add = (q: string) => {
    const k = normQ(q);
    if (!k || seen.has(k) || isJunk(q) || terms.length >= MAX_TERMS) return;
    seen.add(k);
    terms.push(q);
  };

  const gsc = await getGscData(db, projectId); // null when Search Console isn't connected — degrade, don't throw
  if (gsc) {
    for (const r of gsc.risingQueries) add(r.query); // accelerating demand first
    for (const q of gsc.topQueries) add(q.key);
  }

  const tracked = await db
    .select({ keyword: keywords.keyword })
    .from(keywords)
    .where(and(eq(keywords.projectId, projectId), eq(keywords.isTracked, true)))
    .limit(25);
  for (const row of tracked as { keyword: string }[]) add(row.keyword);

  return terms;
}

export interface ConversationScrapeInput {
  searches?: string[];
  subredditUrls?: string[];
  sort?: "New" | "Top" | "Comments" | "Relevance";
  time?: "day" | "week";
  maxItems?: number;
}

/**
 * Runs the full Reddit Conversations pipeline for one project: derive terms +
 * subreddits, scrape (Apify), prefilter, drop already-surfaced threads, judge
 * fit+edge (DeepSeek, top 5 kept), draft a reply for each (Perplexity + DeepSeek),
 * store, and return the newly-stored rows. Logs Apify/Perplexity/DeepSeek spend
 * via logApiUsage (account-level — no projectId), one entry per actual call so
 * the flat per-endpoint cost estimate isn't undercounted (mirrors profile-site.ts).
 *
 * Does NOT catch its own errors — a thrown dependency (e.g. `chat` failing while
 * auto-seeding a brief) propagates to the caller. The daily pass
 * (runDailyConversationRadar) is what makes this fail-soft PER PROJECT by
 * wrapping the call; the on-demand job handler lets it fail the job visibly.
 */
export async function scanProjectConversations(deps: {
  db: any;
  projectId: string;
  domain: string;
  env: unknown; // accepted for parity with runDailyConversationRadar's deps; not consumed directly
  scrape: (input: ConversationScrapeInput) => Promise<RedditPost[]>;
  ask?: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>;
  chat: (m: ChatMessage[]) => Promise<string>;
}): Promise<StoredConversation[]> {
  const { db, projectId, domain } = deps;

  // Knowledge & voice brief + suggested subreddits — auto-seeded once (idempotent
  // on later calls: ensureKnowledgeBrief reads the stored brief back with no LLM
  // call when one already exists).
  const config = await getRedditConfig(db, projectId);
  const { brief, subreddits } = config.knowledgeBrief
    ? { brief: config.knowledgeBrief, subreddits: config.subreddits }
    : await ensureKnowledgeBrief({ db, projectId, domain, chat: deps.chat });

  const terms = await deriveSearchTerms(db, projectId);
  const subredditUrls = subreddits
    .map((s) => s.trim()) // a prior task can store untrimmed subreddit names
    .filter(Boolean)
    .map((s) => `https://www.reddit.com/r/${s}/`);

  // Nothing to search and nowhere to browse — skip the (paid) Apify call
  // rather than running it with empty input.
  if (terms.length === 0 && subredditUrls.length === 0) return [];

  const posts = await deps.scrape({ searches: terms, subredditUrls, time: "week", maxItems: SCRAPE_MAX_ITEMS });
  await logApiUsage(db, { endpoint: APIFY_ENDPOINT, rows: posts.length });
  if (posts.length === 0) return [];

  const fresh = prefilterPosts(posts, { now: Date.now() });
  const seen = await seenThreadUrls(db, projectId); // dedup — never re-surface an already-stored thread
  const candidates = fresh.filter((p) => !seen.has(p.url));
  if (candidates.length === 0) return [];

  const judgements = await judgeConversations(candidates, { brief, chat: deps.chat });
  await logApiUsage(db, { endpoint: DEEPSEEK_CHAT_ENDPOINT, rows: 1 }); // the judge's one batched call

  const postByUrl = new Map(candidates.map((p) => [p.url, p]));
  const kept = judgements
    .filter((j) => j.keep)
    .slice(0, MAX_KEPT)
    .map((j) => ({ judgement: j, post: postByUrl.get(j.url) }))
    .filter((x): x is { judgement: Judgement; post: RedditPost } => !!x.post);

  const rows: NewConversation[] = [];
  for (const { judgement, post } of kept) {
    const draft = await draftReply(post, { brief, ask: deps.ask, chat: deps.chat });
    if (deps.ask) await logApiUsage(db, { endpoint: PERPLEXITY_ENDPOINT, rows: 1 });
    await logApiUsage(db, { endpoint: DEEPSEEK_CHAT_ENDPOINT, rows: 1 }); // this draft's chat call

    const postedAt = post.createdAt && !Number.isNaN(Date.parse(post.createdAt)) ? new Date(post.createdAt) : null;
    rows.push({
      threadUrl: post.url,
      subreddit: post.subreddit,
      title: post.title,
      upVotes: post.upVotes,
      numComments: post.numComments,
      postedAt,
      whyItMatters: judgement.whyItMatters,
      draftReply: draft.reply,
      citations: draft.citations,
      promoRisk: draft.promoRisk,
    });
  }
  if (rows.length === 0) return [];

  const scanDate = new Date().toISOString().slice(0, 10);
  await saveConversations(db, projectId, scanDate, rows);
  return listLatestConversations(db, projectId, rows.length);
}

const RECENCY_MS = 20 * 3_600_000; // ~daily, self-healing (mirrors runDailyRedditRadar / runWeeklyAiVisibility)

export interface ConversationRadarEnv {
  APIFY_API_KEY?: string;
  RESEND_API_KEY?: string;
  REPORT_EMAIL_TO?: string;
  REPORT_EMAIL_FROM?: string;
  APP_URL?: string;
}

type SendEmailImpl = (
  msg: { to: string; from: string; subject: string; html: string; text?: string },
  opts: { apiKey?: string; fetchImpl?: typeof fetch },
) => Promise<{ sent: boolean; reason?: string }>;

const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

/**
 * Self-healing daily Reddit-conversations pass, run from the daily worker tick:
 * for each project not scanned in the last ~20h, run scanProjectConversations
 * and — when it surfaces at least one conversation — email the digest
 * (best-effort: a Resend failure still leaves the conversations stored, since
 * storage happens inside scanProjectConversations before the email is attempted).
 * Off entirely when APIFY_API_KEY is absent (mirrors runWeeklyAiVisibility's
 * EDENAI_API_KEY gate). Fail-soft per project — one project's thrown error
 * (e.g. a DeepSeek outage) never aborts the rest of the pass.
 */
export async function runDailyConversationRadar(deps: {
  db: any;
  now: Date;
  env: ConversationRadarEnv;
  scrape: (input: ConversationScrapeInput) => Promise<RedditPost[]>;
  ask?: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>;
  chat: (m: ChatMessage[]) => Promise<string>;
  sendEmailImpl?: SendEmailImpl;
}): Promise<{ scanned: string[]; emailed: string[] }> {
  const { db, now, env } = deps;
  const scanned: string[] = [];
  const emailed: string[] = [];
  if (!env.APIFY_API_KEY) return { scanned, emailed }; // feature off

  const all = await db.select().from(projects);
  for (const project of all) {
    const latest = await listLatestConversations(db, project.id, 1);
    if (latest[0] && now.getTime() - latest[0].insertedAt.getTime() < RECENCY_MS) continue; // scanned recently

    const domain = bareDomain(project.domain);
    let rows: StoredConversation[];
    try {
      rows = await scanProjectConversations({
        db,
        projectId: project.id,
        domain,
        env,
        scrape: deps.scrape,
        ask: deps.ask,
        chat: deps.chat,
      });
      scanned.push(project.id);
    } catch (e) {
      console.error("[reddit-conversations] daily scan failed for", project.id, e);
      continue;
    }
    if (rows.length === 0) continue; // nothing worth joining today — no email

    const digest = buildConversationsEmail({ domain, conversations: rows, appUrl: env.APP_URL });
    try {
      const sendImpl = deps.sendEmailImpl ?? sendEmail;
      const res = await sendImpl(
        {
          to: env.REPORT_EMAIL_TO ?? "hesham@betterbrainlab.org",
          from: env.REPORT_EMAIL_FROM ?? "Better Search Lab <reports@harperflow.io>",
          subject: digest.subject,
          html: digest.html,
          text: digest.text,
        },
        { apiKey: env.RESEND_API_KEY },
      );
      if (res.sent) emailed.push(project.id);
      else console.warn("[reddit-conversations] email not sent for", project.id, "-", res.reason);
    } catch (e) {
      console.error("[reddit-conversations] email send threw for", project.id, e);
    }
  }
  return { scanned, emailed };
}
