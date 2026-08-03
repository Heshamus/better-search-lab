// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import { RankingsTable } from "@/components/rankings-table";
import type { RankingRow } from "@/lib/rankings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeRow(overrides: Partial<RankingRow> = {}): RankingRow {
  return {
    keywordId: "kw-x",
    keyword: "keyword x",
    rankAbsolute: 10,
    url: "https://example.com/x",
    serpFeatures: [],
    fetchStatus: "ok",
    volume: 500,
    difficulty: 20,
    delta7: null,
    delta30: null,
    ...overrides,
  };
}

// Deliberately NOT pre-sorted by rank (5, 20, 12, null, null) — clicking
// "Position" must produce a genuinely different order, not one that was
// already correct by coincidence.
const rows: RankingRow[] = [
  makeRow({
    keywordId: "kw-1",
    keyword: "improved keyword",
    rankAbsolute: 5,
    delta7: 5,
    delta30: 8,
    serpFeatures: ["featured_snippet"],
  }),
  makeRow({ keywordId: "kw-2", keyword: "dropped keyword", rankAbsolute: 20, delta7: -3, delta30: -1 }),
  makeRow({ keywordId: "kw-3", keyword: "flat keyword", rankAbsolute: 12, delta7: null, delta30: null }),
  makeRow({
    keywordId: "kw-4",
    keyword: "failed keyword",
    rankAbsolute: null,
    url: null,
    fetchStatus: "failed",
    volume: 300,
    difficulty: 15,
  }),
  makeRow({
    keywordId: "kw-5",
    keyword: "unknown keyword",
    rankAbsolute: null,
    url: null,
    fetchStatus: "unknown",
    volume: null,
    difficulty: null,
  }),
];

describe("RankingsTable", () => {
  it("renders a row per keyword with the honest position + delta treatment for each case", () => {
    render(<RankingsTable rows={rows} />);

    for (const row of rows) {
      expect(screen.getByText(row.keyword)).toBeTruthy();
    }

    // delta7: 5 (improved) — accent color + up arrow, never a bare "5".
    const improvedDelta = screen.getByTestId("delta7-kw-1");
    expect(improvedDelta.textContent).toBe("▲5");
    expect(improvedDelta.querySelector("span")).toHaveClass("text-accent");

    // delta7: -3 (dropped) — at-risk color + down arrow.
    const droppedDelta = screen.getByTestId("delta7-kw-2");
    expect(droppedDelta.textContent).toBe("▼3");
    expect(droppedDelta.querySelector("span")).toHaveClass("text-at-risk");

    // delta7: null — honest "—", never a fabricated 0.
    expect(screen.getByTestId("delta7-kw-3").textContent).toBe("—");

    // fetchStatus: failed — "not fetched", never a stale/fabricated rank.
    expect(screen.getByTestId("position-kw-4").textContent).toBe("not fetched");

    // fetchStatus: unknown — "not yet checked", distinct from "failed".
    expect(screen.getByTestId("position-kw-5").textContent).toBe("not yet checked");

    // SERP feature badge renders; an empty list renders nothing extra.
    expect(within(screen.getByTestId("ranking-row-kw-1")).getByText("featured_snippet")).toBeTruthy();
  });

  it("re-sorts rows when the Position header is clicked (nulls sort last)", () => {
    render(<RankingsTable rows={rows} />);

    const before = screen.getAllByTestId(/^ranking-row-/).map((el) => el.getAttribute("data-keyword-id"));
    expect(before).toEqual(["kw-1", "kw-2", "kw-3", "kw-4", "kw-5"]);

    fireEvent.click(screen.getByRole("button", { name: "Position" }));

    const after = screen.getAllByTestId(/^ranking-row-/).map((el) => el.getAttribute("data-keyword-id"));
    expect(after).not.toEqual(before);
    // Ascending by rank: kw-1(5), kw-3(12), kw-2(20), then both nulls (stable, original relative order).
    expect(after).toEqual(["kw-1", "kw-3", "kw-2", "kw-4", "kw-5"]);
  });

  it("expands a row's drill-in and renders the sparkline once the mocked history fetch resolves", async () => {
    const points = [
      { capturedAt: "2026-07-01T00:00:00.000Z", rankAbsolute: 20, fetchStatus: "ok" },
      { capturedAt: "2026-07-15T00:00:00.000Z", rankAbsolute: 5, fetchStatus: "ok" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => points }),
    );

    render(<RankingsTable rows={rows} />);
    fireEvent.click(screen.getByText("improved keyword"));

    const svg = await screen.findByTestId("rank-sparkline");
    expect(svg).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/keywords/kw-1/history");

    // Direction sanity: the BETTER (lower) rank must land HIGHER on the
    // chart — i.e. a smaller svg y — than the worse (higher) rank. This is
    // the exact inversion the brief calls out as easy to get backwards.
    const circles = within(svg).getAllByTestId("sparkline-point");
    const cyByRank = new Map(
      circles.map((c) => [Number(c.getAttribute("data-rank")), Number(c.getAttribute("cy"))]),
    );
    expect(cyByRank.get(5)!).toBeLessThan(cyByRank.get(20)!);
  });

  it("shows an inline error and no fake chart when the history fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );

    render(<RankingsTable rows={rows} />);
    fireEvent.click(screen.getByText("improved keyword"));

    expect(await screen.findByText(/couldn.t load rank history/i)).toBeTruthy();
    expect(screen.queryByTestId("rank-sparkline")).toBeNull();
  });
});
