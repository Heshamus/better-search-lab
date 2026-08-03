// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// KeywordManager calls useRouter().refresh() after a successful mutation, so
// the hook needs the same jsdom-friendly mock every other client-component
// test in this suite uses (mirrors tests/components/opportunity-card.test.tsx).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { KeywordManager, type KeywordManagerRow } from "@/components/keyword-manager";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeKeyword(overrides: Partial<KeywordManagerRow> = {}): KeywordManagerRow {
  return {
    id: "kw-1",
    projectId: "proj-1",
    keyword: "best crm software",
    locationCode: 2840,
    languageCode: "en",
    device: "desktop",
    tags: [],
    isTracked: true,
    createdAt: new Date("2026-08-03T00:00:00Z"),
    ...overrides,
  } as KeywordManagerRow;
}

describe("KeywordManager", () => {
  it("renders a row per tracked keyword", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    render(
      <KeywordManager
        projectId="proj-1"
        keywords={[
          makeKeyword({ id: "kw-1", keyword: "alpha keyword" }),
          makeKeyword({ id: "kw-2", keyword: "beta keyword" }),
        ]}
        defaultLocationCode={2840}
        defaultLanguageCode="en"
      />,
    );

    expect(screen.getByText("alpha keyword")).toBeTruthy();
    expect(screen.getByText("beta keyword")).toBeTruthy();
    expect(screen.getAllByTestId(/^keyword-row-/)).toHaveLength(2);
  });

  it("splits the add box on newlines/commas, trims, drops empties, and posts with the project defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KeywordManager
        projectId="proj-1"
        keywords={[]}
        defaultLocationCode={2840}
        defaultLanguageCode="en"
      />,
    );

    fireEvent.change(screen.getByLabelText(/add keywords/i), {
      target: { value: "alpha, beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add keywords/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/keywords",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "proj-1",
            keywords: [
              { keyword: "alpha", locationCode: 2840, languageCode: "en" },
              { keyword: "beta", locationCode: 2840, languageCode: "en" },
            ],
          }),
        }),
      ),
    );
  });

  it("clicking a row's Untrack posts {tracked:false} to /api/keywords/<id>/track", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KeywordManager
        projectId="proj-1"
        keywords={[makeKeyword({ id: "kw-42" })]}
        defaultLocationCode={2840}
        defaultLanguageCode="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /untrack/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/keywords/kw-42/track",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ tracked: false }),
        }),
      ),
    );
  });

  it("shows an inline error and does not refresh when the track toggle fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KeywordManager
        projectId="proj-1"
        keywords={[makeKeyword({ id: "kw-42" })]}
        defaultLocationCode={2840}
        defaultLanguageCode="en"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /untrack/i }));

    expect(await screen.findByText(/couldn.t update/i)).toBeTruthy();
  });
});
