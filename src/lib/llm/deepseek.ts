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
