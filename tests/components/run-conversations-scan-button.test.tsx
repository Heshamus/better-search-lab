// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

import { RunConversationsScanButton } from "@/components/run-conversations-scan-button";

afterEach(() => {
  cleanup();
  refreshMock.mockClear();
});

describe("RunConversationsScanButton", () => {
  it("enqueues the Reddit conversations scan job and shows a running state", async () => {
    // Pending fetch: the enqueue POST fires (assertable) and the button parks in
    // its running state — no poll timer scheduled, so nothing leaks past the test.
    (global.fetch as any) = vi.fn(() => new Promise<Response>(() => {}));
    render(<RunConversationsScanButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /scan reddit/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/p1/reddit-conversations/scan",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    // Button is disabled while the job is running.
    expect(screen.getByRole("button", { name: /scanning/i })).toBeTruthy();
  });

  it("surfaces the real error when the job can't be started", async () => {
    (global.fetch as any) = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Reddit API unavailable" }), { status: 500 })
    );

    render(<RunConversationsScanButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /scan reddit/i }));

    expect(await screen.findByText(/reddit api unavailable/i)).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
