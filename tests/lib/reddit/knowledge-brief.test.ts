import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { getRedditConfig, saveRedditConfig } from "@/lib/reddit/reddit-config";
import { ensureKnowledgeBrief } from "@/lib/reddit/knowledge-brief";
import type { ChatMessage } from "@/lib/llm/provider";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

describe("ensureKnowledgeBrief", () => {
  it("seeds a brief + subreddits via chat when config is empty, persists them, and prompts with domain + crawl summary", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    const chat = vi.fn(async (_messages: ChatMessage[]) =>
      JSON.stringify({
        brief: "Northwind auto-publishes GEO-optimized articles to Webflow sites.",
        subreddits: ["SEO", "webflow", "content_marketing"],
      }),
    );
    const crawl = vi.fn(async () => "Northwind: AI content automation for Webflow sites. Pricing, blog, features.");

    const result = await ensureKnowledgeBrief({ db: t.db, projectId: p.id, domain: "example-site.com", chat, crawl });

    expect(result).toEqual({
      brief: "Northwind auto-publishes GEO-optimized articles to Webflow sites.",
      subreddits: ["SEO", "webflow", "content_marketing"],
    });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(crawl).toHaveBeenCalledTimes(1);

    // The prompt sent to `chat` must include the domain and the crawl summary text.
    const messages = chat.mock.calls[0][0] as ChatMessage[];
    const promptText = messages.map((m) => m.content).join("\n");
    expect(promptText).toContain("example-site.com");
    expect(promptText).toContain("AI content automation for Webflow sites");

    // Persisted via saveRedditConfig — readable back through the Task 4 store.
    const stored = await getRedditConfig(t.db, p.id);
    expect(stored).toEqual({
      knowledgeBrief: "Northwind auto-publishes GEO-optimized articles to Webflow sites.",
      subreddits: ["SEO", "webflow", "content_marketing"],
    });
  });

  it("is idempotent — returns the stored brief + subreddits WITHOUT calling chat when a brief already exists", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    await saveRedditConfig(t.db, p.id, { knowledgeBrief: "existing brief", subreddits: ["SEO"] });

    const chat = vi.fn(async () => {
      throw new Error("chat must not be called when a brief already exists");
    });

    const result = await ensureKnowledgeBrief({ db: t.db, projectId: p.id, domain: "example-site.com", chat });

    expect(result).toEqual({ brief: "existing brief", subreddits: ["SEO"] });
    expect(chat).not.toHaveBeenCalled();
  });

  it("parses defensively — falls back to the raw text as brief + empty subreddits when chat returns non-JSON", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    const chat = vi.fn(async () => "This company builds SEO tools for Webflow site owners.");
    const result = await ensureKnowledgeBrief({ db: t.db, projectId: p.id, domain: "example-site.com", chat });

    expect(result).toEqual({
      brief: "This company builds SEO tools for Webflow site owners.",
      subreddits: [],
    });

    const stored = await getRedditConfig(t.db, p.id);
    expect(stored.knowledgeBrief).toBe("This company builds SEO tools for Webflow site owners.");
    expect(stored.subreddits).toEqual([]);
  });

  it("works without a crawl dep — still calls chat with the domain and an empty summary", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "Ex", domain: "example.com" });

    const chat = vi.fn(async (_messages: ChatMessage[]) =>
      JSON.stringify({ brief: "Example Co brief", subreddits: ["smallbusiness"] }),
    );

    const result = await ensureKnowledgeBrief({ db: t.db, projectId: p.id, domain: "example.com", chat });

    expect(result).toEqual({ brief: "Example Co brief", subreddits: ["smallbusiness"] });
    const messages = chat.mock.calls[0][0] as ChatMessage[];
    expect(messages.map((m) => m.content).join("\n")).toContain("example.com");
  });
});
