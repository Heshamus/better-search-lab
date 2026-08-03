// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// ResearchExplorer calls useRouter().refresh() after a successful "add to
// tracking" mutation, so the hook needs the same jsdom-friendly mock every
// other client-component test in this suite uses (mirrors
// tests/components/keyword-manager.test.tsx).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ResearchExplorer } from "@/components/research-explorer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DEFAULTS = { projectId: "proj-1", locationCode: 2840, languageCode: "en" };

function renderExplorer() {
  return render(
    <ResearchExplorer
      projectId={DEFAULTS.projectId}
      locationCode={DEFAULTS.locationCode}
      languageCode={DEFAULTS.languageCode}
    />,
  );
}

async function enterSeedAndSearch(seed: string) {
  fireEvent.change(screen.getByLabelText(/seed keyword/i), { target: { value: seed } });
  fireEvent.click(screen.getByRole("button", { name: /^research$/i }));
}

describe("ResearchExplorer", () => {
  it("shows a gentle prompt before any search", () => {
    vi.stubGlobal("fetch", vi.fn());

    renderExplorer();

    expect(screen.getByText(/enter a seed keyword/i)).toBeTruthy();
  });

  it("entering a seed and clicking Research posts /api/research with the projectId + seed + location/language", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer();
    await enterSeedAndSearch("best crm software");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "proj-1",
            keywords: ["best crm software"],
            locationCode: 2840,
            languageCode: "en",
          }),
        }),
      ),
    );
  });

  it("renders a row per idea with its volume + KD values", async () => {
    const items = [
      { keyword: "alpha keyword", searchVolume: 1200, cpc: 2.5, competition: 0.4, difficulty: 35 },
      { keyword: "beta keyword", searchVolume: 800, cpc: 1.1, competition: 0.2, difficulty: 20 },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) }));

    renderExplorer();
    await enterSeedAndSearch("crm");

    expect(await screen.findByText("alpha keyword")).toBeTruthy();
    expect(screen.getByText("beta keyword")).toBeTruthy();
    expect(screen.getAllByTestId(/^idea-row-/)).toHaveLength(2);
    expect(screen.getByText("1200")).toBeTruthy();
    expect(screen.getByText("35")).toBeTruthy();
    expect(screen.getByText("800")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
  });

  it("shows an explicit 'no ideas' empty state when a search returns zero items (not a blank table)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) }));

    renderExplorer();
    await enterSeedAndSearch("an extremely obscure seed");

    expect(await screen.findByText(/no ideas found for that seed/i)).toBeTruthy();
    expect(screen.queryAllByTestId(/^idea-row-/)).toHaveLength(0);
  });

  it("selecting a row's checkbox and clicking Add selected to tracking posts /api/keywords with the selection + defaults", async () => {
    const items = [
      { keyword: "alpha keyword", searchVolume: 1200, cpc: 2.5, competition: 0.4, difficulty: 35 },
      { keyword: "beta keyword", searchVolume: 800, cpc: 1.1, competition: 0.2, difficulty: 20 },
    ];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/research") return Promise.resolve({ ok: true, json: async () => ({ items }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderExplorer();
    await enterSeedAndSearch("crm");
    await screen.findByText("alpha keyword");

    fireEvent.click(screen.getByLabelText("Select alpha keyword"));
    fireEvent.click(screen.getByRole("button", { name: /add selected to tracking/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/keywords",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            projectId: "proj-1",
            keywords: [{ keyword: "alpha keyword", locationCode: 2840, languageCode: "en" }],
          }),
        }),
      ),
    );

    expect(await screen.findByText(/added 1 keyword/i)).toBeTruthy();
  });

  it("disables 'Add selected to tracking' while nothing is selected", async () => {
    const items = [
      { keyword: "alpha keyword", searchVolume: 1200, cpc: 2.5, competition: 0.4, difficulty: 35 },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items }) }));

    renderExplorer();
    await enterSeedAndSearch("crm");
    await screen.findByText("alpha keyword");

    expect(screen.getByRole("button", { name: /add selected to tracking/i })).toBeDisabled();
  });

  it("a failed (!res.ok) research call shows an inline amber error and renders NO idea rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

    renderExplorer();
    await enterSeedAndSearch("crm");

    expect(await screen.findByText(/couldn.t fetch keyword ideas/i)).toBeTruthy();
    expect(screen.queryAllByTestId(/^idea-row-/)).toHaveLength(0);
    expect(screen.queryByText("alpha keyword")).toBeNull();
  });

  it("a network error (fetch rejects) on research also shows the inline error and renders NO idea rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    renderExplorer();
    await enterSeedAndSearch("crm");

    expect(await screen.findByText(/couldn.t fetch keyword ideas/i)).toBeTruthy();
    expect(screen.queryAllByTestId(/^idea-row-/)).toHaveLength(0);
  });
});
