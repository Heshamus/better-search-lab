// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OrganicKeywordsTable } from "@/components/organic-keywords-table";
import type { OrganicKeywordRow } from "@/lib/organic-keywords-store";

afterEach(cleanup);

// Deliberately NOT pre-sorted by position (78, 3, 15) — the default-render test
// below must prove the component actually sorts (position ascending), not just
// echo an input order that already happened to be correct.
const rows: OrganicKeywordRow[] = [
  { keyword: "geo tool", position: 78, searchVolume: 10, difficulty: 5, url: "https://x.io/c", estTraffic: 1 },
  { keyword: "webflow seo", position: 3, searchVolume: 100, difficulty: 20, url: "https://x.io/a", estTraffic: 40 },
  { keyword: "ai visibility", position: 15, searchVolume: 900, difficulty: 55, url: "https://x.io/b", estTraffic: 120 },
];
const props = { projectId: "p1", defaultLocationCode: 2840, defaultLanguageCode: "en", capturedAt: new Date() };

// DOM order of the three fixture keywords, however the component currently
// renders them — used to assert sort behavior without reaching into internals.
function visibleKeywordOrder(): string[] {
  return screen.getAllByText(/^(webflow seo|ai visibility|geo tool)$/).map((el) => el.textContent ?? "");
}

function makeManyRows(n: number): OrganicKeywordRow[] {
  return Array.from({ length: n }, (_, i) => ({
    keyword: `kw-${i + 1}`,
    position: i + 1,
    searchVolume: 10,
    difficulty: 10,
    url: null,
    estTraffic: null,
  }));
}

describe("OrganicKeywordsTable", () => {
  it("renders every keyword by default, sorted by position ascending", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    expect(screen.getByText("webflow seo")).toBeTruthy();
    expect(screen.getByText("ai visibility")).toBeTruthy();
    expect(screen.getByText("geo tool")).toBeTruthy();
    // positions 3, 15, 78 — ascending, NOT the scrambled input order above.
    expect(visibleKeywordOrder()).toEqual(["webflow seo", "ai visibility", "geo tool"]);
  });

  it("clicking the Volume header re-sorts rows by search volume (descending)", () => {
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Volume" }));
    // volumes: webflow seo=100, ai visibility=900, geo tool=10 — descending.
    expect(visibleKeywordOrder()).toEqual(["ai visibility", "webflow seo", "geo tool"]);
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

  it("paginates at 100 rows per page and resets to page 1 when the filtered set shrinks", () => {
    render(<OrganicKeywordsTable {...props} rows={makeManyRows(150)} />);

    expect(screen.getByText("kw-1")).toBeTruthy();
    expect(screen.getByText("kw-100")).toBeTruthy();
    expect(screen.queryByText("kw-101")).toBeNull();
    expect(screen.getByText(/page 1 of 2/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByText("kw-101")).toBeTruthy();
    expect(screen.getByText("kw-150")).toBeTruthy();
    expect(screen.queryByText("kw-1")).toBeNull();
    expect(screen.getByText(/page 2 of 2/i)).toBeTruthy();

    // Narrowing the set (search) while on page 2 must not strand the user past
    // the new last page.
    fireEvent.change(screen.getByPlaceholderText(/search keywords/i), { target: { value: "kw-13" } });
    expect(screen.getByText(/page 1 of 1/i)).toBeTruthy();
    expect(screen.getByText("kw-13")).toBeTruthy();
    expect(screen.queryByText("kw-101")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^prev$/i }));
    expect(screen.getByText(/page 1 of 1/i)).toBeTruthy();
  });

  it("Track posts the keyword to /api/keywords with the project's location/language", async () => {
    const calls: any[] = [];
    (global.fetch as any) = vi.fn(async (url: string, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); });
    render(<OrganicKeywordsTable {...props} rows={rows} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^track$/i })[0]);
    await Promise.resolve();
    expect(calls[0].url).toBe("/api/keywords");
    expect(calls[0].body).toEqual({ projectId: "p1", keywords: [{ keyword: "webflow seo", locationCode: 2840, languageCode: "en" }] });
  });
});
