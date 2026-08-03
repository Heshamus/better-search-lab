// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ProfileReview } from "@/components/profile-review";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

const candidates = [
  { id: "1", keyword: "webflow seo", source: "crawl" as const, volume: 300, difficulty: 20, selected: true },
  { id: "2", keyword: "geo optimization", source: "expansion" as const, volume: 90, difficulty: null, selected: true },
];

describe("ProfileReview", () => {
  it("renders candidates and posts checked rows to /api/keywords", async () => {
    render(<ProfileReview projectId="p1" candidates={candidates} locationCode={2840} languageCode="en" />);
    expect(screen.getByText("webflow seo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /add selected to tracking/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/keywords",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "p1",
            keywords: [
              { keyword: "webflow seo", locationCode: 2840, languageCode: "en" },
              { keyword: "geo optimization", locationCode: 2840, languageCode: "en" },
            ],
          }),
        }),
      ),
    );
  });

  it("only posts still-checked rows to /api/keywords after unchecking one", async () => {
    render(<ProfileReview projectId="p1" candidates={candidates} locationCode={2840} languageCode="en" />);
    fireEvent.click(screen.getByLabelText("Select webflow seo"));
    fireEvent.click(screen.getByRole("button", { name: /add selected to tracking/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/keywords",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "p1",
            keywords: [{ keyword: "geo optimization", locationCode: 2840, languageCode: "en" }],
          }),
        }),
      ),
    );
  });

  it("shows an empty state when there are no candidates", () => {
    render(<ProfileReview projectId="p1" candidates={[]} locationCode={2840} languageCode="en" />);
    expect(screen.getByText(/run profile site/i)).toBeTruthy();
  });
});
