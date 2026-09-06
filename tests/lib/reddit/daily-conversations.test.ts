import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { addKeywords } from "@/lib/keywords";
import { getRedditConfig, saveRedditConfig } from "@/lib/reddit/reddit-config";
import { saveConversations, listLatestConversations } from "@/lib/reddit/conversations-store";
import { apiUsage } from "@/db/schema";
import {
  scanProjectConversations,
  runDailyConversationRadar,
  type ConversationScrapeInput,
} from "@/lib/reddit/daily-conversations";
import type { RedditPost } from "@/lib/reddit/apify";
import type { ChatMessage } from "@/lib/llm/provider";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const post = (overrides: Partial<RedditPost> = {}): RedditPost => ({
  id: "1",
  title: "How do I fix this?",
  body: "",
  url: "https://www.reddit.com/r/SEO/comments/1/how_do_i_fix_this",
  subreddit: "SEO",
  upVotes: 10,
  numComments: 3,
  createdAt: new Date(Date.now() - 3_600_000).toISOString(), // 1h ago — passes the freshness prefilter
  topComments: [],
  ...overrides,
});

// A single chat stub that routes by which system prompt it's seeing (brief /
// judge / draft) so one function can stand in for all three DeepSeek call
// sites the pipeline makes, without over-specifying call order or count.
function makeChat() {
  return vi.fn(async (messages: ChatMessage[]) => {
    const sys = messages[0]?.content ?? "";
    const user = messages[1]?.content ?? "";
    if (sys.includes("knowledge & voice brief")) {
      return JSON.stringify({ brief: "We build SEO tools for small teams.", subreddits: ["SEO"] });
    }
    if (sys.includes("Score EVERY post")) {
      const urls = [...user.matchAll(/url:\s*(\S+)/g)].map((m) => m[1]);
      return JSON.stringify(urls.map((url, i) => ({ url, fit: 0.9, edge: 0.9 - i * 0.01, whyItMatters: `Good fit ${i}` })));
    }
    if (sys.includes("drafting ONE reply")) {
      return "Here's a genuinely useful, non-promotional answer.\nPROMO_RISK: low";
    }
    return "";
  });
}

describe("scanProjectConversations", () => {
  it("runs gather->prefilter->dedup->judge->draft->save and returns the stored rows, excluding an already-seen thread", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });
    await addKeywords(t.db, p.id, [{ keyword: "seo audit tool", locationCode: 2840, languageCode: "en" }]);

    const newPost = post();
    const seenPost = post({ id: "2", url: "https://www.reddit.com/r/SEO/comments/2/already_seen" });
    // Pre-seed the "already seen" thread — scanProjectConversations must drop it via seenThreadUrls.
    await saveConversations(t.db, p.id, "2026-08-05", [{ threadUrl: seenPost.url }]);

    const scrape = vi.fn(async () => [newPost, seenPost]);
    const ask = vi.fn(async () => ({ answer: "current facts", citations: ["https://source.example/1"] }));
    const chat = makeChat();

    const rows = await scanProjectConversations({
      db: t.db,
      projectId: p.id,
      domain: "example.com",
      scrape,
      ask,
      chat,
    });

    expect(scrape).toHaveBeenCalledOnce();
    expect(rows).toHaveLength(1);
    expect(rows[0].threadUrl).toBe(newPost.url);
    expect(rows[0].draftReply).toContain("useful");
    expect(rows[0].citations).toEqual(["https://source.example/1"]);
    expect(rows[0].promoRisk).toBe("low");
    expect(rows.some((r) => r.threadUrl === seenPost.url)).toBe(false); // dedup excluded the already-seen thread

    // logApiUsage was called (account-level cost log — no projectId).
    const usage = await t.db.select().from(apiUsage);
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every((u: { projectId: string | null }) => u.projectId === null)).toBe(true);
  });

  it("auto-seeds a knowledge brief + subreddits when the project's config is empty", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    const scrape = vi.fn(async () => []);
    const chat = makeChat();

    const rows = await scanProjectConversations({
      db: t.db,
      projectId: p.id,
      domain: "example.com",
      scrape,
      chat,
    });

    expect(rows).toEqual([]); // nothing scraped this run — still seeds the brief for next time
    const config = await getRedditConfig(t.db, p.id);
    expect(config.knowledgeBrief).toBe("We build SEO tools for small teams.");
    expect(config.subreddits).toEqual(["SEO"]);
    expect(scrape).toHaveBeenCalledOnce(); // the auto-seeded subreddit gave it something to scrape
  });

  it("threads an injected crawl into the knowledge-brief seed when the project's config is empty", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    const scrape = vi.fn(async () => []);
    const chat = makeChat();
    const crawl = vi.fn(async () => "CRAWLED_SITE_SUMMARY_TEXT");

    await scanProjectConversations({
      db: t.db,
      projectId: p.id,
      domain: "example.com",
      scrape,
      chat,
      crawl,
    });

    expect(crawl).toHaveBeenCalledOnce(); // no real network — the stub stands in for fetchSite
    // The knowledge-brief prompt (routed by makeChat via its system-prompt substring match)
    // must actually carry the crawled text through to the seed, not just invoke the stub.
    const briefCall = chat.mock.calls.find(([messages]) => messages[0]?.content?.includes("knowledge & voice brief"));
    expect(briefCall).toBeDefined();
    const briefPrompt = briefCall![0].map((m: ChatMessage) => m.content).join("\n");
    expect(briefPrompt).toContain("CRAWLED_SITE_SUMMARY_TEXT");
  });

  it("strips a leading r/ (case-insensitively) and trims configured subreddits before building URLs", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["r/SEO", " SEO "] });
    const scrape = vi.fn(async (_input: ConversationScrapeInput) => []);
    const chat = makeChat();

    await scanProjectConversations({
      db: t.db,
      projectId: p.id,
      domain: "example.com",
      scrape,
      chat,
    });

    expect(scrape).toHaveBeenCalledOnce();
    const [{ subredditUrls }] = scrape.mock.calls[0];
    expect(subredditUrls).toEqual(["https://www.reddit.com/r/SEO/", "https://www.reddit.com/r/SEO/"]);
  });
});

describe("runDailyConversationRadar", () => {
  it("no-ops when APIFY_API_KEY is absent", async () => {
    const t = await createTestDb();
    close = t.close;
    await createProject(t.db, { name: "HF", domain: "example.com" });
    const scrape = vi.fn();
    const out = await runDailyConversationRadar({
      db: t.db,
      now: new Date(),
      env: { DEEPSEEK_API_KEY: "k" },
      scrape,
      chat: vi.fn(),
    });
    expect(out).toEqual({ scanned: [], emailed: [] });
    expect(scrape).not.toHaveBeenCalled();
  });

  it("no-ops when DEEPSEEK_API_KEY is absent, even with APIFY_API_KEY set (no billed scrape without a judge)", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    // A working brief so the run would otherwise proceed to scrape — a real
    // config, not a crashing stub, so a missing gate is what fails this test,
    // not an unrelated chat-stub error caught by the per-project try/catch.
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });
    const scrape = vi.fn(async () => []);
    const chat = makeChat();
    const out = await runDailyConversationRadar({
      db: t.db,
      now: new Date(),
      env: { APIFY_API_KEY: "k" },
      scrape,
      chat,
    });
    expect(out).toEqual({ scanned: [], emailed: [] });
    expect(scrape).not.toHaveBeenCalled();
  });

  it("scans a due project and emails the digest via sendEmailImpl", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });

    const scrape = vi.fn(async () => [post()]);
    const ask = vi.fn(async () => ({ answer: "facts", citations: [] as string[] }));
    const chat = makeChat();
    const sendEmailImpl = vi.fn(
      async (msg: { to: string; from: string; subject: string; html: string; text?: string }, _opts: { apiKey?: string }) => ({
        sent: true,
        id: "eml_1",
      }),
    );

    const out = await runDailyConversationRadar({
      db: t.db,
      now: new Date(),
      env: { APIFY_API_KEY: "k", DEEPSEEK_API_KEY: "k" },
      scrape,
      ask,
      chat,
      sendEmailImpl,
    });

    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([p.id]);
    expect(sendEmailImpl).toHaveBeenCalledOnce();
    const [msg] = sendEmailImpl.mock.calls[0];
    expect(msg.subject).toContain("Reddit conversation");
    expect(msg.html).toContain("example.com");
  });

  it("still leaves conversations stored when the email send fails", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "We build SEO tools.", subreddits: ["SEO"] });

    const scrape = vi.fn(async () => [post()]);
    const chat = makeChat();
    const sendEmailImpl = vi.fn(async () => {
      throw new Error("resend down");
    });

    const out = await runDailyConversationRadar({
      db: t.db,
      now: new Date(),
      env: { APIFY_API_KEY: "k", DEEPSEEK_API_KEY: "k" },
      scrape,
      chat,
      sendEmailImpl,
    });

    expect(out.scanned).toEqual([p.id]);
    expect(out.emailed).toEqual([]); // send failed
    const stored = await listLatestConversations(t.db, p.id, 10);
    expect(stored).toHaveLength(1); // but it was already saved before the email attempt
  });

  it("skips a project scanned within the last ~20h", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example.com" });
    await saveConversations(t.db, p.id, "2026-08-06", [{ threadUrl: "https://www.reddit.com/r/x/1" }]);

    const scrape = vi.fn();
    const out = await runDailyConversationRadar({
      db: t.db,
      now: new Date(),
      env: { APIFY_API_KEY: "k", DEEPSEEK_API_KEY: "k" },
      scrape,
      chat: vi.fn(),
    });
    expect(out.scanned).toEqual([]);
    expect(scrape).not.toHaveBeenCalled();
  });
});
