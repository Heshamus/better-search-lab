// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { RefreshDataButton } from "@/components/refresh-data-button";

afterEach(() => {
  cleanup();
  refreshMock.mockClear();
});

describe("RefreshDataButton", () => {
  it("enqueues the single composite refresh-all job and shows a running state", async () => {
    // Pending fetch: the enqueue POST fires (assertable) and the button parks in
    // its running state — no poll timer scheduled, so nothing leaks past the test.
    (global.fetch as any) = vi.fn(() => new Promise<Response>(() => {}));
    render(<RefreshDataButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/p1/refresh-all",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // One composite job now — NOT three chained POSTs.
    expect((global.fetch as any).mock.calls.length).toBe(1);
    expect(screen.getByRole("button", { name: /refreshing/i })).toBeTruthy();
  });

  it("surfaces the real error (not a generic message) when the job can't be started", async () => {
    (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ error: "provider is down" }), { status: 500 }));
    render(<RefreshDataButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));

    expect(await screen.findByText(/provider is down/i)).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
