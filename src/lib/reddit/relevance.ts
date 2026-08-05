import type { RadarResult } from "./radar";
import type { RedditThread } from "./serpapi";
import type { ChatMessage } from "@/lib/llm/deepseek";

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

const SYSTEM =
  "You filter a list of Reddit thread titles down to ONLY those genuinely about a specific business's " +
  "niche — its products, tools, topics, or audience. Ambiguous terms drag in off-topic threads (e.g. " +
  "'copy ai alternative' pulls AI-chatbot threads; a foreign-language game thread; language learning) — " +
  "reject those. Reply with a single JSON object and nothing else.";

function buildPrompt(domain: string, niche: string, titles: string[]): string {
  return [
    `Business: ${domain}`,
    `Its niche: ${niche}`,
    "",
    "Reddit thread titles (numbered):",
    ...titles.map((t, i) => `${i + 1}. ${t}`),
    "",
    'Return ONLY {"relevant": number[]} — the NUMBERS of the titles genuinely about this business\'s ' +
      "niche. Exclude anything that merely shares a word but is about a different product/topic/game/" +
      "language. Reply with the JSON object only.",
  ].join("\n");
}

function parseRelevantIndices(content: string): number[] | null {
  let s = content.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    const rel = (JSON.parse(s) as { relevant?: unknown }).relevant;
    if (!Array.isArray(rel)) return null;
    return rel.map((n) => (typeof n === "number" ? n : Number(n))).filter((n) => Number.isInteger(n));
  } catch {
    return null;
  }
}

/**
 * Drop Reddit threads that aren't actually about the business's niche. One
 * batched DeepSeek call over all collected titles. Fail-open: no chat fn, a
 * thrown call, or unparseable output returns the input unchanged — a flaky judge
 * must never empty the radar.
 */
export async function filterRelevantThreads(results: RadarResult[], deps: { domain: string; niche: string; chat?: ChatFn }): Promise<RadarResult[]> {
  if (!deps.chat) return results;
  const flat: { r: number; i: number; title: string }[] = [];
  results.forEach((res, r) => res.threads.forEach((th, i) => flat.push({ r, i, title: th.title })));
  if (!flat.length) return results;

  try {
    const content = await deps.chat([
      { role: "system", content: SYSTEM },
      { role: "user", content: buildPrompt(deps.domain, deps.niche, flat.map((f) => f.title)) },
    ]);
    const keep = parseRelevantIndices(content);
    if (!keep) return results; // unparseable → fail-open
    const keepSet = new Set(keep);
    const kept: RedditThread[][] = results.map(() => []);
    flat.forEach((f, idx) => {
      if (keepSet.has(idx + 1)) kept[f.r].push(results[f.r].threads[f.i]);
    });
    return results.map((res, r) => ({ t: res.t, threads: kept[r] }));
  } catch {
    return results; // fail-open
  }
}
