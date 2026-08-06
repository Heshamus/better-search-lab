import { describe, it, expect } from "vitest";
import { prefilterPosts } from "@/lib/reddit/prefilter";
import type { RedditPost } from "@/lib/reddit/apify";

// CRITICAL: Fixed reference time (never use real wall-clock for fixtures when assertions use hardcoded `now`)
// Prevents time-bomb where tests pass today but fail in hours or permanently after 2026-08-06T12:00:00Z
const FIXED_NOW = Date.parse("2026-08-06T12:00:00Z");

// Factory for creating RedditPost fixtures
// Default createdAt is 1 hour before FIXED_NOW (deterministically fresh, not real-clock dependent)
function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "post-" + Math.random().toString(36).slice(2),
    title: "A post",
    body: "",
    url: "https://reddit.com/r/test/comment/123",
    subreddit: "test",
    upVotes: 10,
    numComments: 5,
    createdAt: new Date(FIXED_NOW - 3600_000).toISOString(),
    topComments: [],
    ...overrides,
  };
}

describe("prefilterPosts", () => {
  const now = FIXED_NOW;

  it("drops stale posts (older than maxAgeHours default 72)", () => {
    // 73 hours ago
    const stalePost = makePost({
      createdAt: new Date(now - 73 * 3600_000).toISOString(),
      title: "Old question?",
    });

    const result = prefilterPosts([stalePost], { now });
    expect(result).toHaveLength(0);
  });

  it("drops saturated posts (numComments > maxComments default 40)", () => {
    const saturatedPost = makePost({
      numComments: 41,
      title: "Popular question?",
    });

    const result = prefilterPosts([saturatedPost], { now });
    expect(result).toHaveLength(0);
  });

  it("keeps a fresh short-title question (title ends with ?)", () => {
    const questionPost = makePost({
      title: "Is this a good question?",
      body: "", // even with empty body
    });

    const result = prefilterPosts([questionPost], { now });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(questionPost);
  });

  it("keeps a fresh post with body >= minChars (default 80)", () => {
    const bodyPost = makePost({
      title: "Not a question",
      body: "A".repeat(80), // exactly 80 chars
    });

    const result = prefilterPosts([bodyPost], { now });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(bodyPost);
  });

  it("drops a fresh non-question link post with empty body", () => {
    const emptyPost = makePost({
      title: "Check this out",
      body: "",
    });

    const result = prefilterPosts([emptyPost], { now });
    expect(result).toHaveLength(0);
  });

  it("keeps a brand-new post with 0 comments if it has a question or body", () => {
    const newQuestionPost = makePost({
      numComments: 0,
      title: "Brand new question?",
      body: "",
    });

    const result = prefilterPosts([newQuestionPost], { now });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(newQuestionPost);
  });

  it("respects custom maxAgeHours option", () => {
    const post = makePost({
      createdAt: new Date(now - 25 * 3600_000).toISOString(),
      title: "Question?",
    });

    // With default 72, should be kept
    expect(prefilterPosts([post], { now, maxAgeHours: 72 })).toHaveLength(1);

    // With custom 24, should be dropped
    expect(prefilterPosts([post], { now, maxAgeHours: 24 })).toHaveLength(0);
  });

  it("respects custom maxComments option", () => {
    const post = makePost({
      numComments: 50,
      title: "Question?",
    });

    // With default 40, should be dropped
    expect(prefilterPosts([post], { now, maxComments: 40 })).toHaveLength(0);

    // With custom 60, should be kept
    expect(prefilterPosts([post], { now, maxComments: 60 })).toHaveLength(1);
  });

  it("respects custom minChars option", () => {
    const post = makePost({
      title: "Not a question",
      body: "A".repeat(50),
    });

    // With default 80, should be dropped
    expect(prefilterPosts([post], { now, minChars: 80 })).toHaveLength(0);

    // With custom 40, should be kept
    expect(prefilterPosts([post], { now, minChars: 40 })).toHaveLength(1);
  });

  it("handles null numComments as 0", () => {
    const post = makePost({
      numComments: null,
      title: "Question?",
    });

    const result = prefilterPosts([post], { now });
    expect(result).toHaveLength(1);
  });

  it("filters multiple posts correctly", () => {
    const staleQuestion = makePost({
      id: "stale",
      createdAt: new Date(now - 73 * 3600_000).toISOString(),
      title: "Old?",
    });
    const freshQuestion = makePost({
      id: "fresh-q",
      title: "New?",
    });
    const freshBody = makePost({
      id: "fresh-body",
      title: "No question here",
      body: "A".repeat(100),
    });
    const emptyAndNotQuestion = makePost({
      id: "empty",
      title: "No body and not a question",
      body: "",
    });

    const result = prefilterPosts(
      [staleQuestion, freshQuestion, freshBody, emptyAndNotQuestion],
      { now }
    );
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(["fresh-q", "fresh-body"]);
  });

  // IMPORTANT 1: Exact boundary cases — guards against <= → < off-by-one regressions
  it("keeps posts at exact comment boundary (numComments === maxComments default 40)", () => {
    const atBoundary = makePost({
      numComments: 40,
      title: "Boundary question?",
    });

    const result = prefilterPosts([atBoundary], { now });
    expect(result).toHaveLength(1);
  });

  it("keeps posts at exact age boundary (createdAt exactly maxAgeHours ago)", () => {
    // Exactly 72 hours ago (inclusive boundary)
    const atAgeBoundary = makePost({
      createdAt: new Date(now - 72 * 3600_000).toISOString(),
      title: "Boundary age question?",
    });

    const result = prefilterPosts([atAgeBoundary], { now });
    expect(result).toHaveLength(1);
  });

  // IMPORTANT 2: Edge cases for guards (negative age and NaN)
  it("drops future-dated posts (age < 0 from hardcoded now)", () => {
    const futurePost = makePost({
      createdAt: new Date(now + 3600_000).toISOString(), // 1 hour in the future
      title: "Future question?",
    });

    const result = prefilterPosts([futurePost], { now });
    expect(result).toHaveLength(0);
  });

  it("drops posts with unparseable createdAt (Date.parse returns NaN)", () => {
    const unparseable = makePost({
      createdAt: "not-a-date",
      title: "Broken date question?",
    });

    const result = prefilterPosts([unparseable], { now });
    expect(result).toHaveLength(0);
  });
});
