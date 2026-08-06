// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    // Stub fetch to return jobId on enqueue, then status="done" on poll
    let callCount = 0;
    (global.fetch as any) = vi.fn(async (url: string, init: any) => {
      callCount++;
      if (callCount === 1) {
        // First call: enqueue POST returns jobId
        return new Response(JSON.stringify({ jobId: "j1" }), { status: 200 });
      } else if (url.includes("/api/jobs/j1")) {
        // Poll call: return done status
        return new Response(JSON.stringify({ status: "done" }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected call" }), { status: 500 });
    });

    render(<RunConversationsScanButton projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: /scan reddit/i }));

    // Assert the first fetch was a POST to the correct URL
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[0][0]).toBe("/api/projects/p1/reddit-conversations/scan");
      expect(calls[0][1]).toEqual(expect.objectContaining({ method: "POST" }));
    });

    // Assert button is disabled while running
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
