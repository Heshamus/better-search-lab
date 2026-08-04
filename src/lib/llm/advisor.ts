import type { ChatMessage } from "@/lib/llm/deepseek";
import type { EngineResult } from "@/lib/core/opportunity-engine";

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

// The advisor turns the engine's ranked opportunities into a short, sequenced
// action list. It's the "what do I do next" layer — the engine ranks, the advisor
// phrases and orders. Injected chat fn keeps it pure/testable; any failure (no
// key, HTTP error, garbled JSON, count mismatch) degrades to each opportunity's
// own `why`, so /overview never shows an error where it should show guidance.

const MAX_ACTIONS = 8;

const ADVISOR_SYSTEM =
  "You are an SEO strategist. You turn a ranked list of SEO opportunities into a crisp, prioritized " +
  "action list — exactly one concrete imperative instruction per opportunity, 12 words or fewer, no " +
  "fluff, no numbering. Keep the given order. Reply with a JSON array of strings and nothing else.";

function buildPrompt(results: EngineResult[]): string {
  const lines = results.map((r, i) => {
    const bits = [
      `pos ${r.currentPosition ?? "n/a"}`,
      r.volume != null ? `${r.volume} ${r.dataSource === "gsc" ? "impressions" : "vol"}` : null,
      r.upsideEstimate ?? null,
    ].filter(Boolean);
    return `${i + 1}. [${r.type}] "${r.keyword}" (${bits.join(", ")}) — ${r.why}`;
  });
  return [
    "Opportunities, highest priority first:",
    ...lines,
    "",
    `Return ONLY a JSON array of exactly ${results.length} strings — one imperative action per opportunity, ` +
      "same order. Each ≤12 words. No markdown, no commentary.",
  ].join("\n");
}

/** Parse a JSON array of strings, tolerating ```json fences and surrounding prose. */
function parseStringArray(content: string): string[] {
  let s = content.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();
  const tryParse = (text: string): string[] | null => {
    try {
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) return null;
      return arr.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
    } catch {
      return null;
    }
  };
  const direct = tryParse(s);
  if (direct) return direct;
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) return tryParse(s.slice(start, end + 1)) ?? [];
  return [];
}

/**
 * Turn ranked opportunities into a 1:1 action list. Returns exactly one line per
 * input (capped at MAX_ACTIONS). Falls back to each opportunity's `why` unless the
 * model returns exactly the right number of action strings — so the UI can always
 * zip actions to opportunities without misalignment.
 */
export async function summarizeActions(results: EngineResult[], deps?: { chat?: ChatFn }): Promise<string[]> {
  if (!results.length) return [];
  const top = results.slice(0, MAX_ACTIONS);
  const fallback = top.map((r) => r.why);
  if (!deps?.chat) return fallback;
  try {
    const content = await deps.chat([
      { role: "system", content: ADVISOR_SYSTEM },
      { role: "user", content: buildPrompt(top) },
    ]);
    const actions = parseStringArray(content);
    return actions.length === top.length ? actions : fallback;
  } catch {
    return fallback;
  }
}
