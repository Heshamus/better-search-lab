import type { RedditPost } from "./apify";
import type { ChatMessage } from "@/lib/llm/provider";

// Drafts ONE Reddit reply per candidate thread. Two dependencies, both
// optional-ish in effect: `ask` (Perplexity, via Eden) grounds the reply in
// current web facts but is allowed to be absent or to fail — a stale web
// research call must never block a draft. `chat` (DeepSeek) writes the reply
// itself under a guardrail system prompt and self-rates how promotional the
// reply reads; if THAT fails, we do not fabricate a reply — we return the
// honest empty draft flagged `promoRisk: "high"` so a caller's UI never shows
// a blank-looking-safe row for a call that actually failed.

export interface Draft {
  reply: string;
  citations: string[];
  promoRisk: "low" | "medium" | "high";
}

const PERPLEXITY_MODEL = "perplexityai/sonar";

const SYSTEM_PROMPT =
  "You are drafting ONE reply to a Reddit thread on behalf of a company, guided by its brief, the " +
  "thread itself, and (when available) fresh web research. Keep it TIGHT and Reddit-native: a short " +
  "paragraph plus at most one concrete tip or example — NOT a long multi-point essay, a numbered " +
  "listicle, or a wall of text (those read as bot-written and get downvoted). The reply must be genuinely " +
  "value-first and helpful, and non-promotional in REGISTER — never an ad, a sales pitch, or corporate " +
  "copy — and must match the subreddit's own tone (casual, technical, terse, dry — whatever it actually " +
  "is). But value-first does NOT mean generic: the substance must come from the company's OWN area of " +
  "expertise as described in the brief — bring that specific angle, insight, and vocabulary; do NOT give " +
  "bland general advice, and NEVER recommend unrelated or competing tools. A reply that scrubs every " +
  "trace of the company's domain and could have been written by anyone is a FAILURE. Include ONE soft, " +
  "natural, first-person mention of the company by name and what it does (e.g. \"we built a tool that " +
  "automates X\") where it genuinely fits the asker's need — a single light touch, not repeated: naming " +
  "it once is fine, a link-beg or hard pitch is not. Don't just repeat advice already in the thread's top " +
  "comments; add the angle it's missing. After the reply, on its own new line, self-rate how promotional " +
  'it reads to a skeptical Redditor by writing exactly "PROMO_RISK: low", "PROMO_RISK: medium", or ' +
  '"PROMO_RISK: high" — rate honestly, not generously. Output the reply text followed by that PROMO_RISK ' +
  "line, and nothing else.";

function buildResearchQuestion(post: RedditPost): string {
  return (
    `A Reddit user in r/${post.subreddit} is asking: "${post.title}". ` +
    "What are the current, factual, up-to-date facts or answers relevant to this question?"
  );
}

function formatTopComments(post: RedditPost): string {
  return post.topComments.length
    ? post.topComments.map((c) => `  - ${c.body}`).join("\n")
    : "  (no comments yet)";
}

function buildUserPrompt(brief: string, post: RedditPost, web: { answer: string; citations: string[] }): string {
  const lines = [
    "Company brief:",
    '"""',
    brief,
    '"""',
    "",
    `Subreddit: r/${post.subreddit}`,
    `Thread title: ${post.title}`,
    "Thread body:",
    post.body || "(no body)",
    "",
    "Existing top comments (do not just repeat these — add something the thread doesn't have yet):",
    formatTopComments(post),
  ];
  if (web.answer) {
    lines.push("", "Fresh web research on this topic:", '"""', web.answer, '"""');
  }
  lines.push("", "Write the ONE reply now, following your guardrails, then the PROMO_RISK line.");
  return lines.join("\n");
}

/**
 * Fetch grounding web facts via Perplexity. Fail-soft by design: `ask` being
 * absent, or throwing, is treated identically to "no web facts available" —
 * a drafted reply must never block on this dependency.
 */
async function fetchWebFacts(
  post: RedditPost,
  ask?: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>,
): Promise<{ answer: string; citations: string[] }> {
  if (!ask) return { answer: "", citations: [] };
  try {
    return await ask(PERPLEXITY_MODEL, buildResearchQuestion(post));
  } catch {
    return { answer: "", citations: [] };
  }
}

const PROMO_RISK_LINE = /PROMO_RISK:\s*(low|medium|high)\b/i;

/**
 * Split the model's rating line out of its reply text. A missing/unparseable
 * rating defaults to "medium" — never invalidates the reply itself, since an
 * un-self-rated reply is still real model output, just without a confident
 * self-assessment.
 */
function parseDraft(content: string): { reply: string; promoRisk: "low" | "medium" | "high" } {
  let promoRisk: "low" | "medium" | "high" = "medium";
  const kept: string[] = [];
  for (const line of content.split("\n")) {
    const m = line.match(PROMO_RISK_LINE);
    if (m) {
      promoRisk = m[1].toLowerCase() as "low" | "medium" | "high";
      continue; // drop the rating line out of the visible reply text
    }
    kept.push(line);
  }
  return { reply: kept.join("\n").trim(), promoRisk };
}

/**
 * Draft one guardrailed, (optionally) web-grounded reply to a Reddit thread.
 *
 * Honesty contract:
 * - `ask` absent, or thrown: draft proceeds from brief+post alone, `citations: []`.
 * - `chat` thrown (or resolves with something that isn't usable string content):
 *   returns `{ reply: "", citations: [], promoRisk: "high" }` — NEVER a
 *   fabricated reply. `promoRisk: "high"` here means "unvetted", not a genuine
 *   self-rating, so a caller never treats a failed draft as a safe empty one.
 */
export async function draftReply(
  post: RedditPost,
  deps: {
    brief: string;
    ask?: (model: string, prompt: string) => Promise<{ answer: string; citations: string[] }>;
    chat: (m: ChatMessage[]) => Promise<string>;
  },
): Promise<Draft> {
  const web = await fetchWebFacts(post, deps.ask);

  // The chat call AND the parse both live inside this try/catch (not just the
  // await), mirroring judge.ts: a `chat` that resolves with non-string
  // content (a real risk for any LLM HTTP client) must still fail closed
  // rather than throw a TypeError out of draftReply.
  try {
    const content = await deps.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(deps.brief, post, web) },
    ]);
    const { reply, promoRisk } = parseDraft(content);
    return { reply, citations: web.citations, promoRisk };
  } catch {
    return { reply: "", citations: [], promoRisk: "high" };
  }
}
