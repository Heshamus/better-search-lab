// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// GapTable's row-level "Add to tracking" control calls useRouter().refresh()
// after a successful add, so it needs the same jsdom-friendly router mock
// every other client-component test in this suite uses (mirrors
// tests/components/opportunity-card.test.tsx and keyword-manager.test.tsx).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { GapTable } from "@/components/gap-table";
import type { GapSignal } from "@/lib/core/detectors/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeGap(overrides: Partial<GapSignal> = {}): GapSignal {
  return {
    keyword: "seo reporting software",
    volume: 500,
    difficulty: 20,
    competitorCount: 1,
    ...overrides,
  };
}

describe("GapTable", () => {
  it("renders a row per gap with keyword + competitorCount + volume, sorted by volume desc", () => {
    const rows: GapSignal[] = [
      makeGap({ keyword: "low volume gap", volume: 100, competitorCount: 3 }),
      makeGap({ keyword: "high volume gap", volume: 900, competitorCount: 1 }),
    ];

    render(<GapTable rows={rows} projectId="proj-1" defaultLocationCode={2840} defaultLanguageCode="en" />);

    expect(screen.getByText("low volume gap")).toBeTruthy();
    expect(screen.getByText("high volume gap")).toBeTruthy();
    expect(screen.getByTestId("gap-competitors-low volume gap").textContent).toBe("3");
    expect(screen.getByTestId("gap-volume-high volume gap").textContent).toBe("900");

    // Sorted by volume desc: the 900-volume gap must render before the 100.
    const order = screen.getAllByTestId(/^gap-row-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["gap-row-high volume gap", "gap-row-low volume gap"]);
  });

  it("tie-breaks equal volume by competitorCount desc, and sorts null volume last", () => {
    const rows: GapSignal[] = [
      makeGap({ keyword: "no volume yet", volume: null, competitorCount: 9 }),
      makeGap({ keyword: "tie low competitors", volume: 400, competitorCount: 1 }),
      makeGap({ keyword: "tie high competitors", volume: 400, competitorCount: 4 }),
    ];

    render(<GapTable rows={rows} projectId="proj-1" defaultLocationCode={2840} defaultLanguageCode="en" />);

    const order = screen.getAllByTestId(/^gap-row-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([
      "gap-row-tie high competitors",
      "gap-row-tie low competitors",
      "gap-row-no volume yet",
    ]);
    expect(screen.getByTestId("gap-volume-no volume yet").textContent).toBe("—");
  });

  it("shows 'No gaps yet — refresh to collect.' when rows is empty", () => {
    render(<GapTable rows={[]} projectId="proj-1" defaultLocationCode={2840} defaultLanguageCode="en" />);
    expect(screen.getByText("No gaps yet — refresh to collect.")).toBeTruthy();
  });

  it("clicking 'Add to tracking' posts the gap keyword + project defaults to /api/keywords", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GapTable
        rows={[makeGap({ keyword: "add me", volume: 200, competitorCount: 2 })]}
        projectId="proj-1"
        defaultLocationCode={2840}
        defaultLanguageCode="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add to tracking/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/keywords",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "proj-1",
            keywords: [{ keyword: "add me", locationCode: 2840, languageCode: "en" }],
          }),
        }),
      ),
    );

    expect(await screen.findByText("Added")).toBeTruthy();
  });

  it("shows an inline error (never a silent no-op) when the add fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GapTable
        rows={[makeGap({ keyword: "add me", volume: 200, competitorCount: 2 })]}
        projectId="proj-1"
        defaultLocationCode={2840}
        defaultLanguageCode="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /add to tracking/i }));

    expect(await screen.findByText(/couldn.t add/i)).toBeTruthy();
  });
});
