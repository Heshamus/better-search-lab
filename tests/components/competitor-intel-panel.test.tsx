// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CompetitorIntelPanel } from "@/components/competitor-intel-panel";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("CompetitorIntelPanel", () => {
  it("renders keywords and pages and refreshes", async () => {
    render(
      <CompetitorIntelPanel
        projectId="p1"
        competitorDomain="rival.com"
        keywords={[{ id: "1", keyword: "their kw", rankAbsolute: 4, url: "https://rival.com/x", volume: 200, difficulty: 15 }]}
        // topKeywords intentionally differs from the keywords[] fixture above
        // (a plain "their kw" single-entry array would join to the exact
        // same text as the Top keywords cell, and RTL's getByText default
        // exact-match would then find two elements and throw — a fixture
        // collision, not a real behavior to guard). Two entries here is also
        // more realistic for keywordCount: 3 than a single repeated keyword.
        topPages={[{ url: "https://rival.com/x", keywordCount: 3, topKeywords: ["their kw", "second term"] }]}
      />,
    );
    expect(screen.getByText("their kw")).toBeTruthy();
    expect(screen.getByText("https://rival.com/x")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/p1/competitors/intel/refresh",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows an empty state when nothing fetched", () => {
    render(<CompetitorIntelPanel projectId="p1" competitorDomain="rival.com" keywords={[]} topPages={[]} />);
    expect(screen.getByText(/not fetched yet/i)).toBeTruthy();
  });
});
