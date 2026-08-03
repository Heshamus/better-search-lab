// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { UsageReport } from "@/components/usage-report";

afterEach(() => {
  cleanup();
});

describe("UsageReport", () => {
  it("renders the total, a row per day, and a row per endpoint", () => {
    render(
      <UsageReport
        summary={{
          total: 0.85,
          byDay: [
            { day: "2026-08-01", cost: 0.5 },
            { day: "2026-08-02", cost: 0.35 },
          ],
          byEndpoint: [{ endpoint: "…/keyword_ideas/live", cost: 0.5, rows: 100 }],
        }}
      />,
    );

    expect(screen.getByText("$0.85")).toBeTruthy();

    const day1 = screen.getByTestId("usage-day-2026-08-01");
    expect(within(day1).getByText("2026-08-01")).toBeTruthy();
    expect(within(day1).getByText("$0.50")).toBeTruthy();

    const day2 = screen.getByTestId("usage-day-2026-08-02");
    expect(within(day2).getByText("2026-08-02")).toBeTruthy();
    expect(within(day2).getByText("$0.35")).toBeTruthy();

    const endpointRow = screen.getByTestId("usage-endpoint-…/keyword_ideas/live");
    expect(within(endpointRow).getByText("…/keyword_ideas/live")).toBeTruthy();
    expect(within(endpointRow).getByText("$0.50")).toBeTruthy();
    expect(within(endpointRow).getByText("100")).toBeTruthy();
  });

  it("renders $0.00 and a gentle empty note for an all-empty summary (never blank)", () => {
    render(<UsageReport summary={{ total: 0, byDay: [], byEndpoint: [] }} />);

    expect(screen.getByText("$0.00")).toBeTruthy();
    expect(screen.getByText(/no usage yet this month/i)).toBeTruthy();
  });
});
