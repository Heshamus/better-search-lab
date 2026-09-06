import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { getConfig } from "@/lib/config/resolve";
import { edenModels, makeChatProvider, makeEdenClient, NOT_CONFIGURED } from "@/lib/config/clients";
import { getGscData } from "@/lib/google/store";
import { measuredEngines } from "@/lib/ai-visibility/engines";
import { buildQueries } from "@/lib/ai-visibility/queries";
import { runScan } from "@/lib/ai-visibility/scan";
import { saveScan } from "@/lib/ai-visibility/store";
import type { ChatProvider } from "@/lib/llm/provider";

// Rough blended Eden cost per answer across the three engines (sonar is the
// priciest; the others are cents). Conservative so we never under-report spend.
const EDEN_COST_PER_ANSWER = 0.006;
const SCAN_TOTAL = 15; // bounded: 15 queries x 3 engines = 45 answers/scan

/** True when a query is really about the brand itself (testing AI visibility on
 *  your own name is meaningless — everyone "cites" you for your brand). */
function isBrandQuery(q: string, name: string, domain: string): boolean {
  const t = q.toLowerCase();
  const root = domain.split(".")[0]?.toLowerCase() ?? "";
  const nameTok = (name ?? "").toLowerCase().split(/\s+/)[0] ?? "";
  return [root, nameTok].filter((x) => x.length >= 3).some((tok) => t.includes(tok));
}

/** Skip GSC "queries" that aren't natural buyer questions — search-operator
 *  strings (site:/-site:), quoted exact-match probes, or overly long ones. They
 *  read as noise in the work-list and waste engine calls. */
function isJunkQuery(q: string): boolean {
  return q.length > 90 || /\bsite:/i.test(q) || /["']/.test(q);
}

function parseStringArray(content: string): string[] {
  let s = content.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  const slice = start >= 0 && end > start ? s.slice(start, end + 1) : s;
  try {
    const arr = JSON.parse(slice);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** DeepSeek buyer-question generator (fail-soft → []). Brand names excluded. */
async function generateBuyerQuestions(client: ChatProvider, ctx: { domain: string; hints: string[]; count: number }): Promise<string[]> {
  try {
    const content = await client.chat([
      {
        role: "system",
        content:
          "You are an SEO strategist. Generate the natural questions real buyers ask AI assistants " +
          "when researching a purchase in this niche. NO brand names. Reply with a JSON array of strings only.",
      },
      {
        role: "user",
        content:
          `Domain: ${ctx.domain}\nNiche hints: ${ctx.hints.join(", ") || "(infer from the domain)"}\n` +
          `Generate ${ctx.count} distinct buyer questions (best / alternatives / comparison / use-case / category), ` +
          "6-100 chars each, no brand names. JSON array of strings only.",
      },
    ]);
    return parseStringArray(content).slice(0, ctx.count);
  } catch {
    return [];
  }
}

/**
 * `ai_visibility_scan`: measure whether AI engines (Perplexity/ChatGPT/Gemini)
 * name/cite this project's domain for a hybrid query set (70% real GSC top
 * queries, 30% generated buyer questions), and snapshot the result.
 */
export function aiVisibilityScanHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const cfg = await getConfig(db, { fresh: true });
    const eden = makeEdenClient(cfg, opts?.fetchImpl);
    if (!eden) throw new Error(`AI Visibility isn't connected. ${NOT_CONFIGURED.edenai}`);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) throw new Error("project not found");
    const domain = String(project.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
    const name = project.name || domain.split(".")[0];

    const gsc = await getGscData(db, projectId!);
    const gscQueries = (gsc?.topQueries ?? [])
      .map((q) => q.key)
      .filter((k) => typeof k === "string" && k.length >= 3 && !isBrandQuery(k, name, domain) && !isJunkQuery(k));

    const generate = async (): Promise<string[]> => {
      const chat = makeChatProvider(cfg, opts?.fetchImpl);
      if (!chat) return [];
      return generateBuyerQuestions(chat, { domain, hints: gscQueries.slice(0, 8), count: Math.ceil(SCAN_TOTAL * 0.3) });
    };

    const queries = await buildQueries({ gscQueries, generate, total: SCAN_TOTAL });
    if (!queries.length) throw new Error("no queries to scan — connect Search Console or add tracked keywords first");

    const data = await runScan({
      queries,
      engines: measuredEngines(edenModels(cfg)),
      prospect: { name, domain },
      ask: (model, prompt) => eden.ask(model, prompt),
    });
    await saveScan(db, projectId!, data);

    return { rows: data.answersTotal, cost: data.answersTotal * EDEN_COST_PER_ANSWER };
  };
}
