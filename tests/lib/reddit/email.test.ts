import { describe, it, expect } from "vitest";
import { buildConversationsEmail } from "@/lib/reddit/email";
import type { StoredConversation } from "@/lib/reddit/conversations-store";

const conv = (o: Partial<StoredConversation> = {}): StoredConversation => ({
  id: "c1",
  scanDate: "2026-08-06",
  threadUrl: "https://reddit.com/r/webdev/comments/abc123/help_with_seo",
  subreddit: "webdev",
  title: "How do I fix my site's SEO?",
  upVotes: 42,
  numComments: 13,
  postedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
  whyItMatters: "Direct question about SEO tooling, high engagement.",
  draftReply: "Here's what I'd check first: crawlability, then your sitemap.",
  citations: ["https://moz.com/beginners-guide-to-seo"],
  promoRisk: "low",
  status: "new",
  insertedAt: new Date("2026-08-06T09:00:00Z"),
  ...o,
});

describe("buildConversationsEmail", () => {
  it("builds a subject with the conversation count and domain", () => {
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [conv(), conv(), conv()] });
    expect(r.subject).toBe("3 Reddit conversations worth joining — acme.com");
  });

  it("uses singular grammar for exactly one conversation", () => {
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [conv()] });
    expect(r.subject).toBe("1 Reddit conversation worth joining — acme.com");
  });

  it("includes subreddit, an age/score/comments context line, whyItMatters, the draft, the thread link, and citations, in both html and text", () => {
    const c = conv();
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [c] });
    for (const body of [r.html, r.text]) {
      expect(body).toContain("webdev");
      expect(body).toContain("2h ago");
      expect(body).toContain("42");
      expect(body).toContain("13");
      expect(body).toContain(c.whyItMatters);
      expect(body).toContain(c.draftReply);
      expect(body).toContain(c.threadUrl);
      expect(body).toContain(c.citations[0]);
    }
  });

  it("renders em-dashes instead of blanks or crashing for null postedAt/upVotes/numComments", () => {
    const c = conv({ postedAt: null, upVotes: null, numComments: null });
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [c] });
    expect(r.html).toContain("—");
    expect(r.text).toContain("—");
  });

  it("renders a write-your-own note instead of a fake reply when draftReply is empty (the drafter's failure sentinel)", () => {
    const c = conv({ draftReply: "", promoRisk: "high" });
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [c] });
    expect(r.html).toMatch(/write your own/i);
    expect(r.text).toMatch(/write your own/i);
  });

  it("gates the write-your-own note on an empty/whitespace-only draft, not on promoRisk alone", () => {
    const whitespaceOnly = conv({ draftReply: "   ", promoRisk: "low" });
    const r1 = buildConversationsEmail({ domain: "acme.com", conversations: [whitespaceOnly] });
    expect(r1.html).toMatch(/write your own/i);

    const highRiskButReal = conv({ draftReply: "Check out our tool, it's great!", promoRisk: "high" });
    const r2 = buildConversationsEmail({ domain: "acme.com", conversations: [highRiskButReal] });
    expect(r2.html).not.toMatch(/write your own/i);
    expect(r2.html).toContain(highRiskButReal.draftReply);
    expect(r2.text).toContain(highRiskButReal.draftReply);
  });

  it("HTML-escapes titles, whyItMatters, and draftReply", () => {
    const c = conv({
      title: "<script>alert(1)</script>",
      whyItMatters: "Uses <b>bold</b> & such",
      draftReply: "Reply with <img src=x> & stuff",
    });
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [c] });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img src=x>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("&amp;");
  });

  it("returns a valid subject/html/text with a nothing-worth-joining body for an empty list", () => {
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [] });
    expect(r.subject.length).toBeGreaterThan(0);
    expect(r.subject).toContain("acme.com");
    expect(r.html).toMatch(/nothing worth joining today/i);
    expect(r.text).toMatch(/nothing worth joining today/i);
  });

  it("does not dump raw row fields outside the declared contract (e.g. id/status)", () => {
    const c = conv({ id: "SECRET-ROW-ID-999", status: "internal-only-status-xyz" });
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [c] });
    expect(r.html).not.toContain("SECRET-ROW-ID-999");
    expect(r.text).not.toContain("SECRET-ROW-ID-999");
    expect(r.html).not.toContain("internal-only-status-xyz");
    expect(r.text).not.toContain("internal-only-status-xyz");
  });

  it("omits an empty citations section instead of rendering a blank list", () => {
    const c = conv({ citations: [] });
    const r = buildConversationsEmail({ domain: "acme.com", conversations: [c] });
    expect(r.html).not.toContain("Sources:");
    expect(r.text).not.toContain("Sources:");
  });

  it("defaults appUrl and honors an override", () => {
    const r1 = buildConversationsEmail({ domain: "acme.com", conversations: [] });
    expect(r1.html).toContain("https://seo-web.supergenius.cloud");

    const r2 = buildConversationsEmail({ domain: "acme.com", conversations: [], appUrl: "https://custom.app/" });
    expect(r2.html).toContain("https://custom.app/reddit");
    expect(r2.html).not.toContain("https://custom.app//reddit");
  });
});
