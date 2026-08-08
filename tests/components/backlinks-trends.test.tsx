// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BacklinksTrends } from "@/components/backlinks-trends";
import type { BacklinkHistoryPoint } from "@/lib/backlinks-store";

afterEach(cleanup);

function point(overrides: Partial<BacklinkHistoryPoint> = {}): BacklinkHistoryPoint {
  return {
    at: new Date("2026-08-01T00:00:00Z"),
    backlinks: 0,
    referringDomains: 0,
    rank: null,
    domains: [],
    ...overrides,
  };
}

describe("BacklinksTrends", () => {
  it("renders 4 cards with headlines computed from the latest snapshot", () => {
    const history: BacklinkHistoryPoint[] = [
      point({ at: new Date("2026-08-01T00:00:00Z"), backlinks: 100, referringDomains: 10, rank: 200, domains: ["a.com"] }),
      point({ at: new Date("2026-08-02T00:00:00Z"), backlinks: 150, referringDomains: 12, rank: 220, domains: ["a.com", "b.com"] }),
    ];

    render(<BacklinksTrends history={history} />);

    expect(screen.getByText("Total backlinks")).toBeTruthy();
    expect(screen.getByText("Referring domains")).toBeTruthy();
    expect(screen.getByText("Domain rank")).toBeTruthy();
    expect(screen.getByText("Net new/lost referring domains")).toBeTruthy();

    const headlines = screen.getAllByTestId("trend-headline").map((el) => el.textContent);
    expect(headlines).toEqual([
      "150", // Total backlinks: formatCompact(150)
      "12", // Referring domains: formatCompact(12)
      "220", // Domain rank: String(Math.round(220))
      "+1", // Net new/lost: b.com added vs. the first snapshot
    ]);
  });

  it("renders 4 empty-state cards for an empty history", () => {
    render(<BacklinksTrends history={[]} />);

    const headlines = screen.getAllByTestId("trend-headline");
    expect(headlines).toHaveLength(4);
    expect(headlines.every((el) => el.textContent === "—")).toBe(true);
    expect(screen.queryAllByTestId("trend-delta")).toHaveLength(0); // no history → no Δ chip

    expect(screen.getAllByText("Refresh backlinks to build a trend")).toHaveLength(4);
  });
});
