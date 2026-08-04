// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CompetitorIntelPanel } from "@/components/competitor-intel-panel";

afterEach(() => cleanup());

describe("CompetitorIntelPanel", () => {
  it("renders keywords and pages and enqueues the intel-refresh job on click", async () => {
    (global.fetch as any) = vi.fn(() => new Promise<Response>(() => {})); // pending → running, no timer leak
    render(
      <CompetitorIntelPanel
        projectId="p1"
        competitorDomain="rival.com"
        keywords={[{ id: "1", keyword: "their kw", rankAbsolute: 4, url: "https://rival.com/x", volume: 200, difficulty: 15 }]}
        topPages={[{ url: "https://rival.com/x", keywordCount: 3, topKeywords: ["their kw", "second term"] }]}
      />,
    );
    expect(screen.getByText("their kw")).toBeTruthy();
    expect(screen.getByText("https://rival.com/x")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));
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
