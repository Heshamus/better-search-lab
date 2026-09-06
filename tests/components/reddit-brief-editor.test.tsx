// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// RedditBriefEditor calls useRouter().refresh() after a successful save, so
// the hook needs the same jsdom-friendly mock every other client-component
// test in this suite uses (mirrors settings-form.test.tsx /
// reddit-conversations.test.tsx). `refreshMock` is hoisted to a single
// stable reference shared across every `useRouter()` call — a plain
// `() => ({ refresh: vi.fn() })` factory would hand back a brand-new vi.fn()
// on every re-render, which would make "was it called" assertions unreliable.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RedditBriefEditor } from "@/components/reddit-brief-editor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshMock.mockClear();
});

describe("RedditBriefEditor", () => {
  it("renders the seeded knowledge brief and subreddits (one per line)", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(
      <RedditBriefEditor
        projectId="proj-1"
        knowledgeBrief="Northwind auto-publishes GEO-optimized articles to Webflow sites."
        subreddits={["SEO", "webflow"]}
      />,
    );

    expect(screen.getByLabelText(/knowledge/i)).toHaveValue(
      "Northwind auto-publishes GEO-optimized articles to Webflow sites.",
    );
    expect(screen.getByLabelText(/subreddit/i)).toHaveValue("SEO\nwebflow");
  });

  it("renders an empty brief and empty subreddit list for a never-configured project", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<RedditBriefEditor projectId="proj-1" knowledgeBrief={null} subreddits={[]} />);

    expect(screen.getByLabelText(/knowledge/i)).toHaveValue("");
    expect(screen.getByLabelText(/subreddit/i)).toHaveValue("");
  });

  it("editing the brief and saving PUTs the edited brief + parsed subreddits, then refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<RedditBriefEditor projectId="proj-42" knowledgeBrief="old brief" subreddits={["SEO", "webflow"]} />);

    fireEvent.change(screen.getByLabelText(/knowledge/i), { target: { value: "new brief text" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/proj-42/reddit-config");
    expect(options.method).toBe("PUT");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(options.body);
    expect(body.knowledgeBrief).toBe("new brief text");
    expect(body.subreddits).toEqual(["SEO", "webflow"]);

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("parses the subreddits textarea on comma AND newline, trimming and dropping empties", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<RedditBriefEditor projectId="proj-7" knowledgeBrief="" subreddits={[]} />);

    fireEvent.change(screen.getByLabelText(/subreddit/i), {
      target: { value: "SEO,webflow\n\n  marketing  \n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.subreddits).toEqual(["SEO", "webflow", "marketing"]);
  });

  it("shows an honest error and does not claim success when the save request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<RedditBriefEditor projectId="proj-1" knowledgeBrief="brief" subreddits={["SEO"]} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/couldn.t save/i)).toBeTruthy();
    expect(screen.queryByText(/^saved\.?$/i)).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("shows an honest error and does not claim success when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    render(<RedditBriefEditor projectId="proj-1" knowledgeBrief="brief" subreddits={["SEO"]} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/couldn.t save/i)).toBeTruthy();
    expect(screen.queryByText(/^saved\.?$/i)).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
