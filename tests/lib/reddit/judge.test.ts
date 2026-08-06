import { describe, it, expect, vi } from "vitest";
import { judgeConversations } from "@/lib/reddit/judge";
import type { RedditPost } from "@/lib/reddit/apify";
import type { ChatMessage } from "@/lib/llm/deepseek";

function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "post-" + Math.random().toString(36).slice(2),
    title: "How do I fix this?",
    body: "I've been stuck on this problem for a week and nothing I try works.",
    url: "https://reddit.com/r/test/comments/1",
    subreddit: "test",
    upVotes: 10,
    numComments: 3,
    createdAt: "2026-08-05T00:00:00Z",
    topComments: [{ body: "Have you tried restarting?", upVotes: 2 }],
    ...overrides,
  };
}

function makeThreePosts() {
  const postA = makePost({ id: "a", url: "https://reddit.com/r/test/a", title: "Post A title" });
  const postB = makePost({ id: "b", url: "https://reddit.com/r/test/b", title: "Post B title" });
  const postC = makePost({ id: "c", url: "https://reddit.com/r/test/c", title: "Post C title" });
  return { postA, postB, postC, posts: [postA, postB, postC] as RedditPost[] };
}

describe("judgeConversations", () => {
  it("returns one judgement per post keyed by url, computes keep = fit>=0.5 && edge>=0.6, sorted by edge desc", async () => {
    const { postA, postB, postC, posts } = makeThreePosts();
    // A sits exactly on both thresholds (inclusive boundary) -> keep.
    // B has high edge but fit just under 0.5 -> drop.
    // C has high fit but edge just under 0.6 -> drop.
    const canned = JSON.stringify([
      { url: postA.url, fit: 0.5, edge: 0.6, whyItMatters: "boundary keep" },
      { url: postB.url, fit: 0.49, edge: 0.9, whyItMatters: "fit too low" },
      { url: postC.url, fit: 0.9, edge: 0.59, whyItMatters: "edge too low" },
    ]);
    const chat = vi.fn(async () => canned);

    const result = await judgeConversations(posts, { brief: "We sell SEO tools for agencies.", chat });

    expect(result).toHaveLength(3);
    // Sorted by edge desc: B(0.9) > A(0.6) > C(0.59)
    expect(result.map((j) => j.url)).toEqual([postB.url, postA.url, postC.url]);

    const byUrl = new Map(result.map((j) => [j.url, j]));
    expect(byUrl.get(postA.url)).toEqual({ url: postA.url, fit: 0.5, edge: 0.6, whyItMatters: "boundary keep", keep: true });
    expect(byUrl.get(postB.url)).toEqual({ url: postB.url, fit: 0.49, edge: 0.9, whyItMatters: "fit too low", keep: false });
    expect(byUrl.get(postC.url)).toEqual({ url: postC.url, fit: 0.9, edge: 0.59, whyItMatters: "edge too low", keep: false });
  });

  it("prompts with the brief and every post's title + body", async () => {
    const { posts } = makeThreePosts();
    const chat = vi.fn(async (_messages: ChatMessage[]) =>
      JSON.stringify(posts.map((p) => ({ url: p.url, fit: 0.6, edge: 0.7, whyItMatters: "ok" }))),
    );

    await judgeConversations(posts, { brief: "UNIQUE_BRIEF_MARKER_9182", chat });

    expect(chat).toHaveBeenCalledTimes(1);
    const messages = chat.mock.calls[0][0] as ChatMessage[];
    const promptText = messages.map((m) => m.content).join("\n");
    expect(promptText).toContain("UNIQUE_BRIEF_MARKER_9182");
    for (const p of posts) {
      expect(promptText).toContain(p.title);
      expect(promptText).toContain(p.body);
    }
  });

  it("fails closed when chat throws — every post comes back unjudged, never surfaced as kept", async () => {
    const { posts } = makeThreePosts();
    const chat = vi.fn(async () => {
      throw new Error("network blew up");
    });

    const result = await judgeConversations(posts, { brief: "x", chat });

    expect(result).toEqual(posts.map((p) => ({ url: p.url, fit: 0, edge: 0, whyItMatters: "", keep: false })));
  });

  it("fails closed when chat returns unparseable JSON", async () => {
    const { posts } = makeThreePosts();
    const chat = vi.fn(async () => "not json at all, sorry");

    const result = await judgeConversations(posts, { brief: "x", chat });

    expect(result).toEqual(posts.map((p) => ({ url: p.url, fit: 0, edge: 0, whyItMatters: "", keep: false })));
  });

  it("fails closed for EVERY post (not just the missing one) when chat returns incomplete JSON", async () => {
    const { postA, postB, posts } = makeThreePosts();
    // Only 2 of 3 posts judged; the third (postC) is missing entirely from the response.
    const chat = vi.fn(async () =>
      JSON.stringify([
        { url: postA.url, fit: 0.9, edge: 0.9, whyItMatters: "great fit" },
        { url: postB.url, fit: 0.9, edge: 0.9, whyItMatters: "great fit" },
      ]),
    );

    const result = await judgeConversations(posts, { brief: "x", chat });

    // postA/postB WERE judged in the response, but the batch is incomplete, so
    // the fail-closed default applies to ALL posts, not only the missing one.
    expect(result).toEqual(posts.map((p) => ({ url: p.url, fit: 0, edge: 0, whyItMatters: "", keep: false })));
  });

  it("returns [] without calling chat when there are no posts", async () => {
    const chat = vi.fn(async () => "[]");

    const result = await judgeConversations([], { brief: "x", chat });

    expect(result).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });
});
