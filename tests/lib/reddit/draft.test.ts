import { describe, it, expect, vi } from "vitest";
import { draftReply } from "@/lib/reddit/draft";
import type { RedditPost } from "@/lib/reddit/apify";
import type { ChatMessage } from "@/lib/llm/provider";

function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "post-1",
    title: "What's the best way to track keyword rankings without spending all day on it?",
    body: "I've been manually checking rankings in a spreadsheet and it's eating my whole afternoon. Looking for recommendations.",
    url: "https://reddit.com/r/SEO/comments/1",
    subreddit: "SEO",
    upVotes: 10,
    numComments: 2,
    createdAt: "2026-08-05T00:00:00Z",
    topComments: [
      { body: "I just use SEMrush position tracking, does the job.", upVotes: 5 },
      { body: "Ahrefs rank tracker is solid too if you already pay for it.", upVotes: 3 },
    ],
    ...overrides,
  };
}

// Assertions live OUTSIDE the ask/chat mock bodies, never inside them: both calls
// run inside draftReply's own try/catch, so a thrown `expect` inside a mock would
// be swallowed by the fail-soft/fail-closed handling and silently "pass".

describe("draftReply", () => {
  it("happy path: calls Perplexity for web facts, drafts via chat, returns reply+citations+promoRisk", async () => {
    const post = makePost();
    const ask = vi.fn(async (_model: string, _prompt: string) => ({
      answer: "Independent rank trackers update daily and cover local + mobile SERPs as of 2026.",
      citations: ["https://example.com/rank-tracking-2026"],
    }));
    const chat = vi.fn(
      async (_messages: ChatMessage[]) =>
        "Honestly a lot of people just automate this with a dedicated rank tracker instead of a spreadsheet — saves hours a week.\nPROMO_RISK: low",
    );

    const result = await draftReply(post, { brief: "We sell an SEO platform for agencies.", ask, chat });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("perplexityai/sonar", expect.any(String));
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      reply:
        "Honestly a lot of people just automate this with a dedicated rank tracker instead of a spreadsheet — saves hours a week.",
      citations: ["https://example.com/rank-tracking-2026"],
      promoRisk: "low",
    });
  });

  it("asks Perplexity a question about the thread's own topic", async () => {
    const post = makePost();
    const ask = vi.fn(async (_model: string, _prompt: string) => ({ answer: "", citations: [] }));
    const chat = vi.fn(async (_messages: ChatMessage[]) => "reply\nPROMO_RISK: medium");

    await draftReply(post, { brief: "brief", ask, chat });

    const [model, prompt] = ask.mock.calls[0] as [string, string];
    expect(model).toBe("perplexityai/sonar");
    expect(prompt).toContain(post.title);
  });

  it("draft prompt contains the brief, post body, top comments, web facts, and the guardrail instructions", async () => {
    const post = makePost();
    const ask = vi.fn(async (_model: string, _prompt: string) => ({
      answer: "UNIQUE_WEB_FACT_777_current rank trackers cover mobile SERPs",
      citations: [],
    }));
    const chat = vi.fn(async (_messages: ChatMessage[]) => "reply text\nPROMO_RISK: medium");

    await draftReply(post, { brief: "UNIQUE_BRIEF_MARKER_9182", ask, chat });

    expect(chat).toHaveBeenCalledTimes(1);
    const messages = chat.mock.calls[0][0] as ChatMessage[];
    const promptText = messages.map((m) => m.content).join("\n");

    expect(promptText).toContain("UNIQUE_BRIEF_MARKER_9182");
    expect(promptText).toContain(post.body);
    for (const c of post.topComments) expect(promptText).toContain(c.body);
    expect(promptText).toContain("UNIQUE_WEB_FACT_777_current rank trackers cover mobile SERPs");

    const lower = promptText.toLowerCase();
    expect(lower).toContain("non-promotional");
    expect(lower).toContain("value-first");
    expect(lower).toContain("natural");
    expect(lower).toContain("tone");
  });

  it("ask absent: still drafts from brief+post, citations: [] (does not block on missing Perplexity dep)", async () => {
    const post = makePost();
    const chat = vi.fn(async (_messages: ChatMessage[]) => "Helpful reply with no web dep.\nPROMO_RISK: low");

    const result = await draftReply(post, { brief: "brief", chat });

    expect(result).toEqual({ reply: "Helpful reply with no web dep.", citations: [], promoRisk: "low" });
    const messages = chat.mock.calls[0][0] as ChatMessage[];
    expect(messages.map((m) => m.content).join("\n")).toContain(post.body);
  });

  it("ask throws: still drafts from brief+post, citations: [] (never blocks on Perplexity failure)", async () => {
    const post = makePost();
    const ask = vi.fn(async () => {
      throw new Error("perplexity is down");
    });
    const chat = vi.fn(async () => "Helpful reply despite web research failing.\nPROMO_RISK: medium");

    const result = await draftReply(post, { brief: "brief", ask, chat });

    expect(result).toEqual({ reply: "Helpful reply despite web research failing.", citations: [], promoRisk: "medium" });
  });

  it("chat throws: returns the honest empty/high draft, never a fabricated reply", async () => {
    const post = makePost();
    const ask = vi.fn(async () => ({ answer: "some facts", citations: ["https://example.com/a"] }));
    const chat = vi.fn(async () => {
      throw new Error("deepseek is down");
    });

    const result = await draftReply(post, { brief: "brief", ask, chat });

    expect(result).toEqual({ reply: "", citations: [], promoRisk: "high" });
  });

  it("fails closed (does not reject) when chat resolves with non-string content", async () => {
    const post = makePost();
    const chat = vi.fn(async () => null as unknown as string);

    const result = await draftReply(post, { brief: "brief", chat });

    expect(result).toEqual({ reply: "", citations: [], promoRisk: "high" });
  });

  it("defaults promoRisk to medium when the chat output has no parseable rating", async () => {
    const post = makePost();
    const chat = vi.fn(async () => "Just a plain reply, no rating line at all.");

    const result = await draftReply(post, { brief: "brief", chat });

    expect(result.promoRisk).toBe("medium");
    expect(result.reply).toBe("Just a plain reply, no rating line at all.");
    expect(result.citations).toEqual([]);
  });

  it("parses a high promoRisk rating and strips the rating line out of the visible reply", async () => {
    const post = makePost();
    const chat = vi.fn(async () => "Check out our amazing tool, it solves everything!\nPROMO_RISK: high");

    const result = await draftReply(post, { brief: "brief", chat });

    expect(result.promoRisk).toBe("high");
    expect(result.reply).toBe("Check out our amazing tool, it solves everything!");
    expect(result.reply).not.toContain("PROMO_RISK");
  });
});
