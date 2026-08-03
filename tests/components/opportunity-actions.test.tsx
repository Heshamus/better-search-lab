// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// OpportunityActions calls useRouter().refresh() after a successful status
// mutation, so the hook needs the same jsdom-friendly mock every other
// client-component test in this suite uses (mirrors keyword-manager.test.tsx
// / gap-table.test.tsx). Unlike those, THIS file needs to assert on
// refresh's call count directly, so `refreshMock` is hoisted to a single
// stable reference shared across every `useRouter()` call — a plain
// `() => ({ refresh: vi.fn() })` factory would hand back a brand-new vi.fn()
// on every re-render (setPending/setError both trigger one), which would
// make "was/wasn't called" assertions unreliable.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { OpportunityActions } from "@/components/opportunity-actions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshMock.mockClear();
});

describe("OpportunityActions", () => {
  it("shows an inline error and does NOT refresh when the status POST returns !ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<OpportunityActions id="opp-1" status="new" keyword="best crm software" />);
    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    expect(await screen.findByText(/couldn.t update/i)).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("surfaces the same inline error (and does not refresh) on a network throw", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    render(<OpportunityActions id="opp-1" status="new" keyword="best crm software" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(await screen.findByText(/couldn.t update/i)).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("calls router.refresh and shows no error when the status POST succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    render(<OpportunityActions id="opp-1" status="new" keyword="best crm software" />);
    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/couldn.t update/i)).toBeNull();
  });

  it("clears a previous error on a new attempt that succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<OpportunityActions id="opp-1" status="new" keyword="best crm software" />);
    const trackButton = () => screen.getByRole("button", { name: "Track" });

    fireEvent.click(trackButton());
    expect(await screen.findByText(/couldn.t update/i)).toBeTruthy();

    fireEvent.click(trackButton());
    await waitFor(() => expect(screen.queryByText(/couldn.t update/i)).toBeNull());
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
