// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AiVisibilityDashboard } from "@/components/ai-visibility-dashboard";
import type { AiVisibilityRow } from "@/lib/ai-visibility/store";

afterEach(cleanup);

const row = (o: Partial<AiVisibilityRow> = {}): AiVisibilityRow => ({
  id: "1",
  scannedAt: new Date("2026-08-05"),
  queries: [{ text: "best ai seo tool", source: "gsc" }],
  engines: [
    { engine: "perplexity", answers: 5, named: 3, cited: 2 },
    { engine: "chatgpt", answers: 5, named: 1, cited: 0 },
  ],
  perQuery: [
    { text: "best ai seo tool", source: "gsc", named: true, cited: true },
    { text: "frase alternatives", source: "generated", named: false, cited: false },
  ],
  namedTotal: 4,
  citedTotal: 2,
  answersTotal: 10,
  citedSources: [{ domain: "rival.com", count: 6, topUrl: "https://rival.com/x" }],
  ...o,
});

describe("AiVisibilityDashboard", () => {
  it("renders cited rate, per-engine tallies, per-query rows, and competing domains", () => {
    render(<AiVisibilityDashboard latest={row()} history={[row()]} projectDomain="harperflow.io" />);
    expect(screen.getByText("best ai seo tool")).toBeTruthy();
    expect(screen.getByText("frase alternatives")).toBeTruthy();
    expect(screen.getByText("Invisible")).toBeTruthy(); // the uncited query
    expect(screen.getByText("rival.com")).toBeTruthy();
    expect(screen.getByText("Perplexity")).toBeTruthy();
    // cited rate 2/10 = 20%, shown in both the "Cited" tile and the TrendCard headline.
    expect(screen.getAllByText("20%")).toHaveLength(2);
    expect(screen.getByTestId("trend-headline").textContent).toBe("20%");
  });
});
