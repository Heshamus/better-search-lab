// DeepSeek chat client (OpenAI-compatible) used to extract a TIGHT niche from a
// crawl so keyword expansion stays on-topic instead of exploding into the broad
// generic category. Optional: profiling degrades to heuristic seeds when no key
// is configured or the call fails, so this never becomes a hard dependency.
//
// deepseek-v4-pro is a REASONING model. Its response carries BOTH
// choices[0].message.reasoning_content (the thinking) AND
// choices[0].message.content (the final answer). We read `content`, never
// reasoning_content. A stingy max_tokens gets eaten by the reasoning pass and
// returns empty content + finish_reason:"length", so we budget generously.

export class DeepSeekError extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(msg);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const BASE = "https://api.deepseek.com";
const ENDPOINT = "/chat/completions";
const MODEL = "deepseek-v4-pro";
const MAX_TOKENS = 4000; // generous: reasoning + the JSON answer must both fit
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DeepSeekClient {
  private apiKey: string;
  private fetchImpl: typeof fetch;
  constructor(cfg: { apiKey: string; fetchImpl?: typeof fetch }) {
    this.apiKey = cfg.apiKey;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  // Returns the model's final answer text (message.content). Retries once on a
  // 429 / 5xx (transient), then surfaces the failure so callers fall back.
  async chat(messages: ChatMessage[]): Promise<string> {
    const body = { model: MODEL, messages, max_tokens: MAX_TOKENS };
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetchImpl(BASE + ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const json = (await r.json()) as any;
        // Read the ANSWER, not the reasoning trace.
        return json?.choices?.[0]?.message?.content ?? "";
      }
      const retryable = r.status === 429 || r.status >= 500;
      if (retryable && attempt < 1) { await sleep(200 * 2 ** attempt); continue; }
      throw new DeepSeekError(`DeepSeek ${r.status}`, r.status, await r.json().catch(() => undefined));
    }
  }
}

const CORPUS_CAP = 6000;

/** Strip HTML to visible text. Script/style bodies are dropped first so raw JS/CSS doesn't eat the char budget. */
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title + meta description + h1-h3 — the highest-signal text on a page. */
function highSignal(html: string): string {
  const bits: string[] = [];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  if (title) bits.push(stripTags(title));
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (desc) bits.push(stripTags(desc));
  for (const m of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const h = stripTags(m[1]);
    if (h) bits.push(h);
  }
  return bits.filter(Boolean).join(" · ");
}

/**
 * Build a bounded text corpus from crawled pages, preferring title/headings/meta
 * (first pass) and filling any remaining budget with body text (second pass),
 * capped at ~6000 chars total.
 */
function buildCorpus(pages: { url: string; html: string }[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const pg of pages) {
    const hs = highSignal(pg.html);
    if (!hs) continue;
    parts.push(hs);
    total += hs.length;
    if (total >= CORPUS_CAP) break;
  }
  if (total < CORPUS_CAP) {
    for (const pg of pages) {
      const body = stripTags(pg.html);
      if (!body) continue;
      parts.push(body);
      total += body.length;
      if (total >= CORPUS_CAP) break;
    }
  }
  return parts.join("\n").slice(0, CORPUS_CAP);
}

/** Parse a JSON object out of model content, tolerating ```json fences and surrounding prose. */
function parseJsonObject(content: string): any {
  let s = content.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error("could not parse JSON object from model content");
  }
}

function cleanList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

const SYSTEM_PROMPT =
  "You are an SEO strategist. From a website's crawled content you extract the TIGHT, SPECIFIC niche " +
  "it competes in — the actual products, services, methods, platform, audience, and outcomes of THIS " +
  "business — so that keyword expansion stays on-topic instead of drifting into the broad generic " +
  "category. You reply with a single JSON object and nothing else.";

function buildUserPrompt(domain: string, corpus: string): string {
  return [
    `Domain: ${domain}`,
    "",
    "Crawled content (title/headings/meta first, then body text):",
    '"""',
    corpus,
    '"""',
    "",
    "Return ONLY a JSON object with this exact shape:",
    '{ "seeds": string[], "nicheTerms": string[] }',
    "",
    '- "seeds": about 10 tight, SPECIFIC keyword seed phrases to expand for SEO — the real ' +
      "products/services/topics of THIS site (e.g. for an AI-SEO-content tool for Webflow: " +
      '"ai seo content automation", "webflow programmatic seo", "geo optimization for agencies", ' +
      '"automated blog publishing"). NOT broad one-word category terms.',
    '- "nicheTerms": about 15 SPECIFIC distinguishing vocabulary words or short phrases that define ' +
      "this business's niche — its tools, methods, platform, audience, outcomes (e.g. " +
      '"seo","content","automation","webflow","geo","programmatic","agency","publishing","blog",' +
      '"rankings"). CRITICAL: do NOT return the bare category term alone (e.g. just "ai") — that is ' +
      "shared with the whole generic category and would let generic competitors through. Return what " +
      "makes THIS business specific.",
    "",
    "Reply with the JSON object only — no markdown, no commentary.",
  ].join("\n");
}

/**
 * Ask DeepSeek to distill a crawl into tight niche seeds + distinguishing niche
 * vocabulary. Throws when the model returns unparseable content or empty arrays,
 * so the caller can fall back to heuristic seeds rather than gate on a fabricated
 * (or absent) niche.
 */
export async function extractNicheSeeds(
  client: DeepSeekClient,
  p: { pages: { url: string; html: string }[]; domain: string },
): Promise<{ seeds: string[]; nicheTerms: string[] }> {
  const corpus = buildCorpus(p.pages);
  const content = await client.chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(p.domain, corpus) },
  ]);
  const parsed = parseJsonObject(content); // throws on garbage
  const seeds = cleanList(parsed?.seeds);
  const nicheTerms = cleanList(parsed?.nicheTerms);
  if (seeds.length === 0 || nicheTerms.length === 0) {
    throw new Error("extractNicheSeeds: model returned empty seeds or nicheTerms");
  }
  return { seeds, nicheTerms };
}

// --- Semantic relevance judge -------------------------------------------------
//
// Token-overlap relevance (lib/core/relevance) cannot distinguish a niche word
// that is ALSO a generic-universe word: "ai search optimization" puts "search"
// in the profile, so "people search" / "google search" clear the overlap gate.
// The judge fixes that by asking the model — which already proved it understands
// the niche when it produced the seeds — to keep only candidates that are about
// what THIS business actually does. It returns INDICES (not echoed keyword
// strings): tiny output that can't be truncated by the reasoning pass, and each
// index maps back to the exact original candidate (no rewrite/hallucination).

// Judge a bounded slice of candidates per call: small enough that one numbered
// list stays readable to the model and the prompt stays well under budget;
// large enough that a ~300-candidate pool is 3-4 calls, not dozens.
const JUDGE_BATCH = 80;

const JUDGE_SYSTEM_PROMPT =
  "You are an SEO strategist filtering candidate keywords down to only those genuinely relevant to " +
  "ONE specific business. A keyword is relevant only if it is about what THIS business actually does, " +
  "offers, sells, or serves. REJECT keywords that merely share a word with the business's vocabulary " +
  "but are really about a different topic, product, brand, or a generic search-engine / directory / " +
  "people-finder / unrelated-tool concept. Prefer precision: when in doubt, reject. You reply with a " +
  "single JSON object and nothing else.";

function buildJudgePrompt(p: { domain: string; seeds: string[]; nicheTerms: string[]; batch: string[] }): string {
  return [
    `Business domain: ${p.domain}`,
    "This business's niche — what it does, its products/methods/platform/audience/outcomes:",
    `- seeds: ${p.seeds.join(", ")}`,
    `- niche terms: ${p.nicheTerms.join(", ")}`,
    "",
    "Candidate keywords (numbered):",
    ...p.batch.map((k, i) => `${i + 1}. ${k}`),
    "",
    'Return ONLY a JSON object: { "relevant": number[] } — the NUMBERS of the candidate keywords a ' +
      "marketer for THIS business would actually target. Include a number only if that keyword is about " +
      "this business's own products/services/topics/audience; exclude any keyword that just shares a " +
      "word with the niche but is really about something else. Reply with the JSON object only — no " +
      "markdown, no commentary.",
  ].join("\n");
}

/**
 * Filter expansion candidates down to those SEMANTICALLY relevant to the niche.
 * Batches the candidates, asks the model for the relevant indices per batch, and
 * unions the exact originals those indices point at.
 *
 * Per-batch resilient: a batch whose call fails (HTTP error, or truncated /
 * garbled JSON with no `relevant` array) does NOT abort the run — its candidates
 * are returned in `unjudged` so the caller decides how to treat them, while every
 * other batch keeps its verdict. One flaky batch must never nuke the whole judge.
 *
 * Returns the kept originals, the number of BILLED calls (a returned chat, even
 * one whose JSON was garbage), and the `unjudged` candidates from failed batches.
 * An empty `relevant` array is a valid "nothing here is relevant" (not a failure).
 */
export async function judgeRelevance(
  client: DeepSeekClient,
  p: { domain: string; seeds: string[]; nicheTerms: string[]; candidates: string[] },
): Promise<{ kept: Set<string>; calls: number; unjudged: string[] }> {
  const batches: string[][] = [];
  for (let i = 0; i < p.candidates.length; i += JUDGE_BATCH) batches.push(p.candidates.slice(i, i + JUDGE_BATCH));

  // Batches are independent, so judge them CONCURRENTLY — sequential calls made
  // profiling ~4× slower (5 serial reasoning calls ≈ 4–5 min). Each batch still
  // fails independently into `unjudged`; one bad batch never sinks the rest.
  const results = await Promise.all(
    batches.map(async (batch) => {
      let called = false;
      try {
        const content = await client.chat([
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: buildJudgePrompt({ domain: p.domain, seeds: p.seeds, nicheTerms: p.nicheTerms, batch }) },
        ]);
        called = true; // a returned chat is a billed call, even if its body is unparseable
        const rel = parseJsonObject(content)?.relevant; // parseJsonObject throws on garbage
        if (!Array.isArray(rel)) throw new Error("judgeRelevance: model response missing 'relevant' array");
        const kept: string[] = [];
        for (const n of rel) {
          const idx = typeof n === "number" ? n : Number(n);
          if (Number.isInteger(idx) && idx >= 1 && idx <= batch.length) kept.push(batch[idx - 1]);
        }
        return { called, kept, unjudged: [] as string[] };
      } catch {
        return { called, kept: [] as string[], unjudged: batch };
      }
    }),
  );

  const kept = new Set<string>();
  const unjudged: string[] = [];
  let calls = 0;
  for (const r of results) {
    if (r.called) calls += 1;
    for (const k of r.kept) kept.add(k);
    unjudged.push(...r.unjudged);
  }
  return { kept, calls, unjudged };
}
