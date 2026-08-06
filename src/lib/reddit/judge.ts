import type { RedditPost } from "./apify";
import type { ChatMessage } from "@/lib/llm/deepseek";

// One batched DeepSeek call that scores every candidate Reddit post on `fit`
// (is this our wheelhouse) and `edge` (would replying add value not already
// said in the thread), and gates `keep` on both. UNLIKE the relevance filter
// (lib/reddit/relevance.ts), which fails OPEN so a flaky judge never empties
// the radar, this judge fails CLOSED: a thrown call, unparseable JSON, or a
// response that doesn't cover every input post is treated as "not judged" for
// EVERY post, never just the ones actually missing. Surfacing a thread we
// never really scored is worse than surfacing nothing.

export interface Judgement {
  url: string;
  fit: number;
  edge: number;
  whyItMatters: string;
  keep: boolean;
}

const FIT_THRESHOLD = 0.5;
const EDGE_THRESHOLD = 0.6;

const SYSTEM_PROMPT =
  "You are a B2B community-participation strategist deciding which Reddit threads are worth a company " +
  "replying to. Score EVERY post listed on two axes: `fit` (0-1) — how squarely the post sits in the " +
  "company's wheelhouse, given its brief; and `edge` (0-1) — whether the company could add REAL value " +
  "not already said in the post body or its existing top comments (a thread the comments already answer " +
  "well has LOW edge, even when fit is high). Also write a one-line `whyItMatters` explaining the " +
  "opportunity. Reply with a single JSON array and nothing else.";

function formatPost(p: RedditPost, i: number): string {
  const comments = p.topComments.length
    ? p.topComments.map((c) => `    - ${c.body}`).join("\n")
    : "    (no comments yet)";
  return [
    `${i + 1}. url: ${p.url}`,
    `   subreddit: r/${p.subreddit}`,
    `   title: ${p.title}`,
    `   body: ${p.body || "(no body)"}`,
    `   top comments:`,
    comments,
  ].join("\n");
}

function buildUserPrompt(brief: string, posts: RedditPost[]): string {
  return [
    "Company brief:",
    '"""',
    brief,
    '"""',
    "",
    "Reddit posts to score:",
    posts.map(formatPost).join("\n\n"),
    "",
    "Return ONLY a JSON array with one entry per post above, each shaped exactly as:",
    '{ "url": string, "fit": number, "edge": number, "whyItMatters": string }',
    "",
    "fit: 0-1, how squarely this is our wheelhouse given the brief. edge: 0-1, can we add value not " +
      "already said in the body or top comments. Use the EXACT url given for each post so entries can be " +
      "matched back. Include every post listed above. No markdown, no commentary — the JSON array only.",
  ].join("\n");
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Only a real JS number (post-JSON.parse) counts — a string/null/missing score makes the entry invalid. */
function toScore(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? clamp01(v) : null;
}

/**
 * Parse the model's JSON array into a url -> {fit,edge,whyItMatters} map.
 * Returns null when the content isn't parseable JSON, isn't an array, or
 * doesn't contain a valid {fit,edge} entry for EVERY input post — a partial
 * judgement is treated exactly like no judgement at all (fail-closed).
 */
function parseJudgements(
  content: string,
  posts: RedditPost[],
): Map<string, { fit: number; edge: number; whyItMatters: string }> | null {
  let s = content.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    const start = s.indexOf("[");
    const end = s.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;

  const byUrl = new Map<string, { fit: number; edge: number; whyItMatters: string }>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const fit = toScore(e.fit);
    const edge = toScore(e.edge);
    if (typeof e.url !== "string" || !e.url || fit === null || edge === null) continue;
    byUrl.set(e.url, { fit, edge, whyItMatters: typeof e.whyItMatters === "string" ? e.whyItMatters : "" });
  }

  // Any input post without a valid judgement makes the WHOLE response
  // incomplete — fail-closed applies to every post, not just the missing one.
  for (const p of posts) {
    if (!byUrl.has(p.url)) return null;
  }
  return byUrl;
}

/** The honest "we didn't judge this" default — never surface an unjudged thread as kept. */
function failClosed(posts: RedditPost[]): Judgement[] {
  return posts.map((p) => ({ url: p.url, fit: 0, edge: 0, whyItMatters: "", keep: false }));
}

/**
 * Score candidate Reddit posts for fit (our wheelhouse) and edge (can we add
 * value not already in the thread), one batched `chat` call. Returns one
 * Judgement per input post, sorted by `edge` descending; callers decide the
 * cutoff (`.filter(j => j.keep).slice(0, 5)`).
 *
 * Fail-closed: a thrown `chat` call, unparseable output, or a response
 * missing a valid judgement for any post returns every post as
 * `{ fit:0, edge:0, whyItMatters:"", keep:false }` — never a partial result.
 */
export async function judgeConversations(
  posts: RedditPost[],
  deps: { brief: string; chat: (m: ChatMessage[]) => Promise<string> },
): Promise<Judgement[]> {
  if (posts.length === 0) return [];

  // The chat call AND the parse both live inside this one try/catch (not just
  // the await) — a `chat` that RESOLVES with a non-string (a real risk: an
  // LLM HTTP client whose message.content came back null/undefined; the
  // `Promise<string>` annotation doesn't enforce that at runtime) must still
  // fail closed, not throw a TypeError out of judgeConversations.
  try {
    const content = await deps.chat([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(deps.brief, posts) },
    ]);

    const byUrl = parseJudgements(content, posts);
    if (!byUrl) return failClosed(posts);

    return posts
      .map((p): Judgement => {
        const j = byUrl.get(p.url)!;
        return {
          url: p.url,
          fit: j.fit,
          edge: j.edge,
          whyItMatters: j.whyItMatters,
          keep: j.fit >= FIT_THRESHOLD && j.edge >= EDGE_THRESHOLD,
        };
      })
      .sort((a, b) => b.edge - a.edge);
  } catch {
    return failClosed(posts);
  }
}
