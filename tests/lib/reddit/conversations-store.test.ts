import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import {
  saveConversations,
  listLatestConversations,
  seenThreadUrls,
  updateConversationStatus,
  type NewConversation,
} from "@/lib/reddit/conversations-store";

let close: (() => Promise<void>) | undefined;
afterEach(() => close?.());

const SCAN_DATE = "2026-08-06";

function row(threadUrl: string, overrides: Partial<NewConversation> = {}): NewConversation {
  return {
    threadUrl,
    subreddit: "SEO",
    title: `discussion at ${threadUrl}`,
    upVotes: 12,
    numComments: 3,
    postedAt: new Date("2026-08-01T00:00:00Z"),
    whyItMatters: "directly on-topic",
    draftReply: "here's a genuinely helpful reply",
    citations: ["https://example.com/source"],
    promoRisk: "low",
    ...overrides,
  };
}

describe("conversations-store", () => {
  it("saves rows then lists them newest-first, capped at limit", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    // Separate sequential saves, each past a real elapsed-time boundary: PGlite's
    // defaultNow() can otherwise tie for statements that land in the same
    // millisecond (observed: back-to-back awaited inserts DID tie), and a tie
    // falls back to an id (random UUID) tiebreak that only guarantees a STABLE
    // order (matching research-history.ts's prune/list agreement), not a
    // chronological one — see listLatestConversations's comment.
    for (let i = 0; i < 5; i++) {
      await saveConversations(t.db, p.id, SCAN_DATE, [row(`https://reddit.com/r/SEO/${i}`)]);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    const latest = await listLatestConversations(t.db, p.id, 3);
    expect(latest).toHaveLength(3); // capped at limit
    expect(latest.map((c) => c.threadUrl)).toEqual([
      "https://reddit.com/r/SEO/4",
      "https://reddit.com/r/SEO/3",
      "https://reddit.com/r/SEO/2",
    ]); // newest-first
    expect(latest[0]).toMatchObject({
      subreddit: "SEO",
      title: "discussion at https://reddit.com/r/SEO/4",
      upVotes: 12,
      numComments: 3,
      whyItMatters: "directly on-topic",
      draftReply: "here's a genuinely helpful reply",
      citations: ["https://example.com/source"],
      promoRisk: "low",
      status: "new", // column default applied
    });
  });

  it("seenThreadUrls returns the set of stored thread urls for the project", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const other = await createProject(t.db, { name: "Other", domain: "other.io" });

    await saveConversations(t.db, p.id, SCAN_DATE, [
      row("https://reddit.com/r/SEO/a"),
      row("https://reddit.com/r/SEO/b"),
    ]);
    await saveConversations(t.db, other.id, SCAN_DATE, [row("https://reddit.com/r/SEO/z")]); // different project

    const seen = await seenThreadUrls(t.db, p.id);
    expect(seen).toEqual(new Set(["https://reddit.com/r/SEO/a", "https://reddit.com/r/SEO/b"]));
    expect(seen.has("https://reddit.com/r/SEO/z")).toBe(false); // scoped per project
  });

  it("dedups a resurfaced thread — saving the same (projectId, threadUrl) again is a silent no-op", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveConversations(t.db, p.id, SCAN_DATE, [row("https://reddit.com/r/SEO/dupe", { draftReply: "first draft" })]);
    // Rescan surfaces the same thread again — must not throw, must not duplicate, must not overwrite.
    await expect(
      saveConversations(t.db, p.id, "2026-08-07", [row("https://reddit.com/r/SEO/dupe", { draftReply: "second draft" })]),
    ).resolves.toBeUndefined();

    const latest = await listLatestConversations(t.db, p.id, 10);
    expect(latest).toHaveLength(1); // no duplicate row
    expect(latest[0].draftReply).toBe("first draft"); // original row untouched, not overwritten
  });

  it("a duplicate thread url on a DIFFERENT project is not deduped (unique index is per-project)", async () => {
    const t = await createTestDb();
    close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.io" });

    await saveConversations(t.db, p1.id, SCAN_DATE, [row("https://reddit.com/r/SEO/shared")]);
    await saveConversations(t.db, p2.id, SCAN_DATE, [row("https://reddit.com/r/SEO/shared")]);

    expect(await listLatestConversations(t.db, p1.id, 10)).toHaveLength(1);
    expect(await listLatestConversations(t.db, p2.id, 10)).toHaveLength(1);
  });

  it("updateConversationStatus updates the row's status, visible via listLatestConversations", async () => {
    const t = await createTestDb();
    close = t.close;
    const p = await createProject(t.db, { name: "HF", domain: "example-site.com" });

    await saveConversations(t.db, p.id, SCAN_DATE, [row("https://reddit.com/r/SEO/dismiss-me")]);
    const [saved] = await listLatestConversations(t.db, p.id, 1);
    expect(saved.status).toBe("new"); // column default, before the update

    await updateConversationStatus(t.db, p.id, saved.id, "dismissed");

    const [updated] = await listLatestConversations(t.db, p.id, 1);
    expect(updated.status).toBe("dismissed");
  });

  it("updateConversationStatus scoped by project — a different project's id touches 0 rows", async () => {
    const t = await createTestDb();
    close = t.close;
    const p1 = await createProject(t.db, { name: "HF", domain: "example-site.com" });
    const p2 = await createProject(t.db, { name: "Other", domain: "other.io" });

    await saveConversations(t.db, p1.id, SCAN_DATE, [row("https://reddit.com/r/SEO/cross-project")]);
    const [saved] = await listLatestConversations(t.db, p1.id, 1);

    // p2 (wrong project) tries to update p1's conversation by its id — must be a no-op.
    await updateConversationStatus(t.db, p2.id, saved.id, "dismissed");

    const [unchanged] = await listLatestConversations(t.db, p1.id, 1);
    expect(unchanged.status).toBe("new"); // untouched by the cross-project update attempt
  });
});
