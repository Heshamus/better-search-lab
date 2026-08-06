// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { StoredConversation } from "@/lib/reddit/conversations-store";

// RedditConversations calls useRouter().refresh() after a successful status
// PATCH, so the hook needs the same jsdom-friendly mock every other
// client-component test in this suite uses (mirrors opportunity-actions.test.tsx
// / run-conversations-scan-button.test.tsx). `refreshMock` is hoisted to a
// single stable reference shared across every `useRouter()` call — a plain
// `() => ({ refresh: vi.fn() })` factory would hand back a brand-new vi.fn()
// on every re-render, which would make "was it called" assertions unreliable.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RedditConversations } from "@/components/reddit-conversations";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshMock.mockClear();
});

// All fields present, as the brief asks — a real row never has an
// undefined field, so fixtures shouldn't lean on optional/partial shapes.
function makeConversation(overrides: Partial<StoredConversation> = {}): StoredConversation {
  return {
    id: "conv-1",
    scanDate: "2026-08-04",
    threadUrl: "https://www.reddit.com/r/seo/comments/abc123/crawl_budget_help/",
    subreddit: "seo",
    title: "How do I fix crawl budget issues on a large site?",
    upVotes: 42,
    numComments: 7,
    postedAt: new Date("2026-08-04T12:00:00Z"),
    whyItMatters: "Direct question in our exact wheelhouse, no good answer yet.",
    draftReply: "Here's what's worked for us on large sites: prioritize XML sitemaps...",
    citations: ["https://example.com/source-a"],
    promoRisk: "low",
    status: "new",
    insertedAt: new Date("2026-08-05T08:00:00Z"),
    ...overrides,
  };
}

describe("RedditConversations", () => {
  it("renders a card per non-dismissed conversation, skipping dismissed ones", () => {
    vi.stubGlobal("fetch", vi.fn());
    const visible = makeConversation({
      id: "c1",
      title: "Visible thread title",
      whyItMatters: "This is why it matters",
      subreddit: "seo",
    });
    const dismissed = makeConversation({ id: "c2", title: "Dismissed thread title", status: "dismissed" });

    render(<RedditConversations conversations={[visible, dismissed]} projectId="proj-1" />);

    expect(screen.getByText("Visible thread title")).toBeTruthy();
    expect(screen.getByText("This is why it matters")).toBeTruthy();
    expect(screen.getByText(/r\/seo/)).toBeTruthy();
    expect(screen.queryByText("Dismissed thread title")).toBeNull();
  });

  it("shows the write-your-own note and no Copy button when draftReply is empty", () => {
    vi.stubGlobal("fetch", vi.fn());
    const conv = makeConversation({ draftReply: "" });

    render(<RedditConversations conversations={[conv]} projectId="proj-1" />);

    expect(screen.getByText(/write your own/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
  });

  it("shows BOTH the draft text and the review-before-posting flag for a high-risk non-empty draft", () => {
    vi.stubGlobal("fetch", vi.fn());
    const conv = makeConversation({ draftReply: "Careful, non-promotional reply text.", promoRisk: "high" });

    render(<RedditConversations conversations={[conv]} projectId="proj-1" />);

    expect(screen.getByText("Careful, non-promotional reply text.")).toBeTruthy();
    expect(screen.getByText(/review before posting/i)).toBeTruthy();
  });

  it("clicking Dismiss PATCHes the status route with {status:\"dismissed\"} and calls router.refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const conv = makeConversation({ id: "conv-42" });

    render(<RedditConversations conversations={[conv]} projectId="proj-9" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-9/reddit-conversations/conv-42/status",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "dismissed" }),
        }),
      );
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("clicking Copy writes the draft text to the clipboard", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const conv = makeConversation({ draftReply: "Copy this exact draft text." });

    render(<RedditConversations conversations={[conv]} projectId="proj-1" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Copy this exact draft text."));
  });

  it("shows 'Copy failed' (never 'Copied') when the clipboard write rejects", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const conv = makeConversation({ draftReply: "Some draft text." });

    render(<RedditConversations conversations={[conv]} projectId="proj-1" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    // findByRole polls (wraps in act/waitFor internally), so the rejected
    // promise is fully settled — and caught, per THE HONESTY RULE — before
    // this assertion runs. No unhandled rejection reaches the test runner.
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });

  it("clicking Mark posted PATCHes the status route with {status:\"posted\"} and calls router.refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const conv = makeConversation({ id: "conv-77" });

    render(<RedditConversations conversations={[conv]} projectId="proj-3" />);
    fireEvent.click(screen.getByRole("button", { name: /mark posted/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/proj-3/reddit-conversations/conv-77/status",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "posted" }),
        }),
      );
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("shows a '✓ Posted' badge and keeps the card visible (not filtered) when status is 'posted'", () => {
    vi.stubGlobal("fetch", vi.fn());
    const conv = makeConversation({ id: "conv-posted", title: "Posted thread title", status: "posted" });

    render(<RedditConversations conversations={[conv]} projectId="proj-1" />);

    expect(screen.getByText("Posted thread title")).toBeTruthy();
    expect(screen.getByText(/✓ Posted/)).toBeTruthy();
    const dismissBtn = screen.getByRole("button", { name: /dismiss/i }) as HTMLButtonElement;
    const postedBtn = screen.getByRole("button", { name: /mark posted/i }) as HTMLButtonElement;
    expect(dismissBtn.disabled).toBe(true);
    expect(postedBtn.disabled).toBe(true);
  });
});
