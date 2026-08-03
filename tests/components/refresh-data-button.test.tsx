// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// RefreshDataButton calls useRouter().refresh() after the full three-step
// chain succeeds, so it needs the same jsdom-friendly mock every other
// client-component test in this suite uses (mirrors refresh-gaps-button's
// consumer tests / opportunity-actions.test.tsx). `refreshMock` is hoisted
// to a single stable reference shared across every `useRouter()` call — a
// plain `() => ({ refresh: vi.fn() })` factory would hand back a brand-new
// vi.fn() on every re-render (each setState below triggers one), which
// would make "was/wasn't called" assertions unreliable.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RefreshDataButton } from "@/components/refresh-data-button";

beforeEach(() => {
  (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ result: "done" }), { status: 200 }));
});

afterEach(() => {
  cleanup();
  refreshMock.mockClear();
});

describe("RefreshDataButton", () => {
  it("posts the pipeline routes in order: refresh -> gaps/refresh -> opportunities/refresh", async () => {
    render(<RefreshDataButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));

    await waitFor(() => expect((global.fetch as any).mock.calls.length).toBeGreaterThanOrEqual(3));

    const urls = (global.fetch as any).mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain("/api/projects/p1/refresh");
    expect(urls).toContain("/api/projects/p1/gaps/refresh");
    expect(urls).toContain("/api/projects/p1/opportunities/refresh");
    // Order matters — gap_refresh and weekly_opportunities both read data
    // the earlier steps produce, so a shuffled sequence would silently
    // score/diff against stale input.
    expect(urls).toEqual([
      "/api/projects/p1/refresh",
      "/api/projects/p1/gaps/refresh",
      "/api/projects/p1/opportunities/refresh",
    ]);

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/couldn.t refresh/i)).toBeNull();
  });

  it("stops the chain and shows an inline error on a mid-chain failure, without calling router.refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "done" }), { status: 200 })) // /refresh ok
      .mockResolvedValueOnce(new Response(null, { status: 500 })); // /gaps/refresh fails
    (global.fetch as any) = fetchMock;

    render(<RefreshDataButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));

    expect(await screen.findByText(/couldn.t refresh/i)).toBeTruthy();

    // Only the first two routes were called — the chain stopped before
    // opportunities/refresh, and never fabricated success.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c: any[]) => c[0]);
    expect(urls).toEqual(["/api/projects/p1/refresh", "/api/projects/p1/gaps/refresh"]);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("surfaces the same inline error (and does not refresh) on a network throw", async () => {
    (global.fetch as any) = vi.fn().mockRejectedValue(new Error("network down"));

    render(<RefreshDataButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));

    expect(await screen.findByText(/couldn.t refresh/i)).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
