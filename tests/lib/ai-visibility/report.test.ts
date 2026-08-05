import { describe, it, expect } from "vitest";
import { buildWeeklyReport } from "@/lib/ai-visibility/report";
import type { AiVisibilityRow } from "@/lib/ai-visibility/store";

const row = (o: Partial<AiVisibilityRow>): AiVisibilityRow => ({
  id: "1",
  scannedAt: new Date("2026-08-12"),
  queries: [],
  engines: [{ engine: "perplexity", answers: 15, named: 2, cited: 3 }],
  perQuery: [],
  namedTotal: 2,
  citedTotal: 3,
  answersTotal: 15,
  citedSources: [{ domain: "rival.com", count: 5, topUrl: "https://rival.com/x" }],
  ...o,
});

describe("buildWeeklyReport", () => {
  it("reports a baseline on the first scan (no previous)", () => {
    const r = buildWeeklyReport({ domain: "harperflow.io", latest: row({ citedTotal: 3, answersTotal: 15 }), previous: null });
    expect(r.subject).toContain("harperflow.io");
    expect(r.subject).toContain("20%"); // 3/15
    expect(r.html).toMatch(/baseline/i);
    expect(r.text).toMatch(/baseline/i);
  });

  it("computes the week-over-week cited-rate delta and lists newly won queries", () => {
    const latest = row({ citedTotal: 6, answersTotal: 15, perQuery: [{ text: "best ai seo", source: "gsc", named: true, cited: true }] });
    const previous = row({ citedTotal: 3, answersTotal: 15, scannedAt: new Date("2026-08-05"), perQuery: [{ text: "best ai seo", source: "gsc", named: false, cited: false }] });
    const r = buildWeeklyReport({ domain: "harperflow.io", latest, previous });
    expect(r.subject).toMatch(/40%/); // 6/15
    expect(r.subject).toMatch(/20/); // +20 pts delta
    expect(r.html).toContain("best ai seo"); // newly won
  });

  it("lists newly won and newly lost queries", () => {
    const latest = row({
      perQuery: [
        { text: "won-q", source: "gsc", named: true, cited: true },
        { text: "lost-q", source: "gsc", named: false, cited: false },
      ],
    });
    const previous = row({
      scannedAt: new Date("2026-08-05"),
      perQuery: [
        { text: "won-q", source: "gsc", named: false, cited: false },
        { text: "lost-q", source: "gsc", named: true, cited: true },
      ],
    });
    const r = buildWeeklyReport({ domain: "harperflow.io", latest, previous });
    expect(r.html).toContain("won-q");
    expect(r.html).toContain("lost-q");
    expect(r.html).toContain("rival.com"); // competing domain
  });
});
