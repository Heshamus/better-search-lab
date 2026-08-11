// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { OrganicKeywordsTable } from "@/components/organic-keywords-table";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";

afterEach(cleanup);

const rows: OrganicKeywordRow[] = [
  { keyword: "webflow seo", position: 3, searchVolume: 100, difficulty: 20, url: "https://x.io/a", estTraffic: 40 },
  { keyword: "ai visibility", position: 15, searchVolume: 900, difficulty: 55, url: "https://x.io/b", estTraffic: 120 },
  { keyword: "geo tool", position: 78, searchVolume: 10, difficulty: 5, url: "https://x.io/c", estTraffic: 1 },
];
const props = { projectId: "p1", defaultLocationCode: 2840, defaultLanguageCode: "en", capturedAt: new Date() };

describe("OrganicKeywordsTable", () => {
  it("renders every keyword by default", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    expect(screen.getByText("webflow seo")).toBeTruthy();
    expect(screen.getByText("ai visibility")).toBeTruthy();
    expect(screen.getByText("geo tool")).toBeTruthy();
  });

  it("the Top 10 position filter keeps only position <= 10", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    // Anchored: "Top 10" is a literal substring of "Top 100", so an unanchored
    // /top 10/i would match both buttons and getByRole would throw.
    fireEvent.click(screen.getByRole("button", { name: /^top 10$/i }));
    expect(screen.getByText("webflow seo")).toBeTruthy();
    expect(screen.queryByText("ai visibility")).toBeNull(); // position 15
    expect(screen.queryByText("geo tool")).toBeNull(); // position 78
  });

  it("the search box filters by keyword text", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    fireEvent.change(screen.getByPlaceholderText(/search keywords/i), { target: { value: "geo" } });
    expect(screen.getByText("geo tool")).toBeTruthy();
    expect(screen.queryByText("webflow seo")).toBeNull();
  });
});
