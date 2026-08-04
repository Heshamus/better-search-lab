// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { UsageReport } from "@/components/usage-report";

afterEach(() => {
  cleanup();
});

describe("UsageReport", () => {
  it("renders the total, a spend-over-time section, and a readable row per endpoint", () => {
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

    expect(screen.getByText("$0.85")).toBeTruthy(); // total tile (unique)
    expect(screen.getByText(/spend over time/i)).toBeTruthy();

    // Endpoint row now shows the readable short label + mono cost/rows.
    const endpointRow = screen.getByTestId("usage-endpoint-…/keyword_ideas/live");
    expect(within(endpointRow).getByText("keyword_ideas")).toBeTruthy();
    expect(within(endpointRow).getByText("$0.50")).toBeTruthy();
    expect(within(endpointRow).getByText("100")).toBeTruthy();
  });

  it("renders $0.00 and a gentle empty note for an all-empty summary (never blank)", () => {
    render(<UsageReport summary={{ total: 0, byDay: [], byEndpoint: [] }} />);

    expect(screen.getByText("$0.00")).toBeTruthy();
    expect(screen.getByText(/no usage yet this month/i)).toBeTruthy();
  });
});
