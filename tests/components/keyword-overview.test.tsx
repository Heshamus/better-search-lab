// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { KeywordOverview } from "@/components/keyword-overview";

const RESULT = {
  rows: [
    { keyword: "alpha", searchVolume: 100, cpc: 2, competition: 0.5, difficulty: 30,
      monthly: [{ year: 2026, month: 7, volume: 80 }, { year: 2026, month: 8, volume: 100 }], trendPct: 25 },
    { keyword: "beta", searchVolume: 5000, cpc: 3, competition: 0.6, difficulty: 60,
      monthly: [{ year: 2026, month: 7, volume: 6000 }, { year: 2026, month: 8, volume: 5000 }], trendPct: -17 },
  ],
  requested: 2, dropped: 0,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("KeywordOverview", () => {
  it("disables Look up until keywords are entered", () => {
    render(<KeywordOverview />);
    expect((screen.getByRole("button", { name: /look up/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("looks up, renders a row per keyword, sorted by Δ12mo desc by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RESULT }));
    render(<KeywordOverview />);
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "alpha\nbeta" } });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));

    await waitFor(() => expect(screen.getAllByTestId(/^ko-row-/)).toHaveLength(2));
    const order = screen.getAllByTestId(/^ko-row-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["ko-row-alpha", "ko-row-beta"]); // +25 before -17
  });

  it("downloads a CSV built from the results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => RESULT }));
    const createURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { createObjectURL: createURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<KeywordOverview />);
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    await waitFor(() => screen.getByRole("button", { name: /download csv/i }));
    fireEvent.click(screen.getByRole("button", { name: /download csv/i }));
    expect(createURL).toHaveBeenCalledTimes(1);
  });

  it("shows an honest error and no rows when the lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "x" }) }));
    render(<KeywordOverview />);
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /look up/i }));
    await waitFor(() => screen.getByText(/couldn.?t look up/i));
    expect(screen.queryAllByTestId(/^ko-row-/)).toHaveLength(0);
  });
});
