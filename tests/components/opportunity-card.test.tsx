// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// OpportunityCard nests the client `OpportunityActions`, which calls
// `useRouter()` from next/navigation. That hook throws ("invariant expected
// app router to be mounted") outside a real Next.js App Router tree, so it
// must be mocked for any jsdom render of the card — mirroring how a real
// app provides the router context, minus the framework runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { OpportunityCard, type OpportunityRow } from "@/components/opportunity-card";

afterEach(() => cleanup());

function makeOpp(overrides: Partial<OpportunityRow> = {}): OpportunityRow {
  return {
    id: "opp-1",
    projectId: "proj-1",
    keywordId: "kw-1",
    keyword: "best crm software",
    volume: 3000,
    difficulty: 30,
    currentPosition: null,
    trend: null,
    type: "gap",
    score: 42,
    scoreBreakdown: {},
    why: "12 competitors rank for this term and you don't — winnable at KD 30.",
    upsideEstimate: "+~120 visits/mo",
    status: "new",
    weekOf: "2026-08-03",
    createdAt: new Date("2026-08-03T00:00:00Z"),
    ...overrides,
  } as OpportunityRow;
}

describe("OpportunityCard", () => {
  it("renders the keyword, the why, the gap chip, the upside, the metric cells, and a Track button", () => {
    render(<OpportunityCard opp={makeOpp()} maxVolume={3000} />);

    expect(screen.getByText("best crm software")).toBeTruthy();
    expect(screen.getByText(/12 competitors rank/)).toBeTruthy();
    expect(screen.getByText("Gap")).toBeTruthy();
    expect(screen.getByText("+~120 visits/mo")).toBeTruthy();
    expect(screen.getByText("Track")).toBeTruthy();

    // Metrics now SHOW the data (bar / badge / heat meter) under labelled cells.
    expect(screen.getByText("Volume")).toBeTruthy();
    expect(screen.getByText("Position")).toBeTruthy();
    expect(screen.getByText("Difficulty")).toBeTruthy();
    expect(screen.getByText("Trend")).toBeTruthy();
    expect(screen.getByText("3K")).toBeTruthy(); // volume 3000, compact
    expect(screen.getByText("30")).toBeTruthy(); // KD value from the heat meter
    // null currentPosition AND null trend both render an honest "—".
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a settled, muted state once status is tracked (no bare 'Track' left offering to repeat)", () => {
    render(<OpportunityCard opp={makeOpp({ status: "tracked" })} />);
    expect(screen.getByText("Tracked")).toBeTruthy();
    expect(screen.queryByText("Track")).toBeNull();
  });
});
