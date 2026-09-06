import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { getConfig } from "@/lib/config/resolve";
import { conversationFetchEnv, makeChatProvider, makeEdenClient, NOT_CONFIGURED } from "@/lib/config/clients";
import { makeConversationScrape } from "@/lib/reddit/scrape-source";
import { scanProjectConversations } from "@/lib/reddit/daily-conversations";
import { fetchSite } from "@/lib/crawl/fetch-site";
import type { ChatMessage } from "@/lib/llm/provider";

const bareDomain = (d: string): string => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

// Plain-text summary of the project's own site, for seeding its Reddit
// knowledge & voice brief (ensureKnowledgeBrief's `crawl` dep). fetchSite
// already strips to HTML per page; this collapses that HTML to bounded plain
// text — a local helper rather than niche.ts's stripTags, which is private
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
    const cfg = await getConfig(db, { fresh: true });
    if (!cfg.reddit.configured && !cfg.apify.configured) throw new Error(NOT_CONFIGURED.reddit);
    const chatProvider = makeChatProvider(cfg, opts?.fetchImpl);
    if (!chatProvider) throw new Error(`Reddit Conversations needs an AI assistant. ${NOT_CONFIGURED.llm}`);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId!));
    if (!project) throw new Error("project not found");
    const domain = bareDomain(project.domain);

    const scrape = makeConversationScrape(conversationFetchEnv(cfg), opts?.fetchImpl);
    const eden = makeEdenClient(cfg, opts?.fetchImpl);
    const ask = eden ? (model: string, prompt: string) => eden.ask(model, prompt) : undefined;
    const chat = (msgs: ChatMessage[]) => chatProvider.chat(msgs);
    const crawl = async () => {
      const r = await fetchSite("https://" + domain, { fetchImpl: opts?.fetchImpl });
      if (r.failed) return "";
      return htmlToText(r.pages);
    };

    const rows = await scanProjectConversations({ db, projectId: projectId!, domain, scrape, ask, chat, crawl });
    return { rows: rows.length, cost: 0 };
  };
}
