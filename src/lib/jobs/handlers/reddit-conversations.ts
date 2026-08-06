import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { loadEnv } from "@/config/env";
import { scrapeReddit } from "@/lib/reddit/apify";
import { scanProjectConversations } from "@/lib/reddit/daily-conversations";
import { fetchSite } from "@/lib/crawl/fetch-site";
import { EdenClient } from "@/lib/ai-visibility/engines";
import { DeepSeekClient, type ChatMessage } from "@/lib/llm/deepseek";

const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

// Plain-text summary of the project's own site, for seeding its Reddit
// knowledge & voice brief (ensureKnowledgeBrief's `crawl` dep). fetchSite
// already strips to HTML per page; this collapses that HTML to bounded plain
// text — a local helper rather than deepseek.ts's stripTags, which is private
// to that module.
function htmlToText(pages: { html: string }[]): string {
  return pages
    .map((p) => p.html)
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

/**
 * `reddit_conversations_scan`: on-demand per-project Reddit Conversations scan
 * (the future "Refresh" button) — runs the same pipeline as the daily pass for
 * one project. No email here; the digest email is the daily pass's job alone.
 */
export function redditConversationsHandler(opts?: { fetchImpl?: typeof fetch }) {
  return async (ctx: { db: any; projectId?: string }) => {
    const { db, projectId } = ctx;
    const env = loadEnv();
    if (!env.APIFY_API_KEY) throw new Error("Reddit Conversations isn't configured on this instance (APIFY_API_KEY missing)");
    if (!env.DEEPSEEK_API_KEY) throw new Error("Reddit Conversations needs DEEPSEEK_API_KEY configured on this instance");

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) throw new Error("project not found");
    const domain = bareDomain(project.domain);

    const scrape = (input: Parameters<typeof scrapeReddit>[1]) =>
      scrapeReddit({ apiKey: env.APIFY_API_KEY!, actor: env.APIFY_REDDIT_ACTOR, fetchImpl: opts?.fetchImpl }, input);
    const ask = env.EDENAI_API_KEY
      ? (model: string, prompt: string) => new EdenClient(env.EDENAI_API_KEY!, opts?.fetchImpl).ask(model, prompt)
      : undefined;
    const deepseek = new DeepSeekClient({ apiKey: env.DEEPSEEK_API_KEY, fetchImpl: opts?.fetchImpl });
    const chat = (msgs: ChatMessage[]) => deepseek.chat(msgs);
    const crawl = async () => {
      const r = await fetchSite("https://" + domain, { fetchImpl: opts?.fetchImpl });
      if (r.failed) return "";
      return htmlToText(r.pages);
    };

    const rows = await scanProjectConversations({ db, projectId: projectId!, domain, env, scrape, ask, chat, crawl });
    return { rows: rows.length, cost: 0 };
  };
}
