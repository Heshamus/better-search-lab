import { getRedditConfig, saveRedditConfig } from "@/lib/reddit/reddit-config";
import type { ChatMessage } from "@/lib/llm/deepseek";

// Auto-seeds the per-project Reddit knowledge & voice brief + suggested
// subreddits, once, the first time Reddit Conversations needs them for a
// project. Idempotent: a project that already has a brief just reads it back
// (no chat call, no cost) — this is meant to be called on every daily run,
// not gated behind a separate "setup" step.

const SUMMARY_CAP = 3000;

const SYSTEM_PROMPT =
  "You are a B2B content strategist preparing a company to participate authentically in Reddit " +
  "discussions. From a company's domain and site summary, you produce a knowledge & voice brief: " +
  "what the company does, the credible expertise it can speak to, concrete facts it can cite, and the " +
  "tone it should strike on Reddit (candid, non-promotional, genuinely helpful — Reddit punishes " +
  "corporate marketing voice). You also suggest subreddits where its audience actually discusses these " +
  "topics. You reply with a single JSON object and nothing else.";

function buildUserPrompt(domain: string, siteSummary: string): string {
  return [
    `Domain: ${domain}`,
    "",
    "Site summary:",
    '"""',
    siteSummary,
    '"""',
    "",
    "Summarize what this company does, the credible expertise it can speak to, concrete facts it can " +
      "cite, and the tone it should strike on Reddit — plus 5-10 subreddits where its audience discusses " +
      "these topics.",
    "",
    "Return ONLY a JSON object with this exact shape:",
    '{ "brief": string, "subreddits": string[] }',
    "",
    "No markdown, no commentary — the JSON object only.",
  ].join("\n");
}

/** Parse `{brief, subreddits}` out of model content. On any failure (garbled JSON, wrong shape), the raw
 *  text becomes the brief and subreddits is empty — a usable-but-unrefined brief beats a thrown error. */
function parseBriefResponse(content: string): { brief: string; subreddits: string[] } {
  try {
    let s = content.trim();
    const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) s = fenced[1].trim();
    const parsed = JSON.parse(s);
    const brief = typeof parsed?.brief === "string" ? parsed.brief.trim() : "";
    if (!brief) throw new Error("empty brief");
    const subreddits = Array.isArray(parsed?.subreddits)
      ? parsed.subreddits.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    return { brief, subreddits };
  } catch {
    return { brief: content.trim(), subreddits: [] };
  }
}

/**
 * Ensures a project has a knowledge & voice brief + suggested subreddits,
 * generating and persisting them on first call and simply reading them back
 * on every later call — so callers (the daily Reddit Conversations job) can
 * unconditionally call this without re-spending an LLM call per run.
 */
export async function ensureKnowledgeBrief(deps: {
  db: any;
  projectId: string;
  domain: string;
  chat: (m: ChatMessage[]) => Promise<string>;
  crawl?: () => Promise<string>; // returns a plain-text summary of key pages
}): Promise<{ brief: string; subreddits: string[] }> {
  const existing = await getRedditConfig(deps.db, deps.projectId);
  if (existing.knowledgeBrief) {
    return { brief: existing.knowledgeBrief, subreddits: existing.subreddits };
  }

  const siteSummary = deps.crawl ? (await deps.crawl()).slice(0, SUMMARY_CAP) : "";
  const content = await deps.chat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(deps.domain, siteSummary) },
  ]);
  const { brief, subreddits } = parseBriefResponse(content);

  await saveRedditConfig(deps.db, deps.projectId, { knowledgeBrief: brief, subreddits });
  return { brief, subreddits };
}
