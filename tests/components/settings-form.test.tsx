// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// SettingsForm calls useRouter().refresh() after a successful save, so the
// hook needs the same jsdom-friendly mock every other client-component test
// in this suite uses (mirrors tests/components/keyword-manager.test.tsx).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { SettingsForm } from "@/components/settings-form";
import { DEFAULT_WEIGHTS } from "@/lib/core/scoring";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ALL_WEIGHT_KEYS = ["volume", "winnability", "position", "trend", "relevance"];

describe("SettingsForm", () => {
  it("renders all five weight inputs pre-filled from the given weights, plus the cadence select", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<SettingsForm projectId="proj-1" weights={DEFAULT_WEIGHTS} cadence="weekly" />);

    expect(screen.getByLabelText(/volume/i)).toHaveValue(DEFAULT_WEIGHTS.volume);
    expect(screen.getByLabelText(/winnability/i)).toHaveValue(DEFAULT_WEIGHTS.winnability);
    expect(screen.getByLabelText(/position/i)).toHaveValue(DEFAULT_WEIGHTS.position);
    expect(screen.getByLabelText(/trend/i)).toHaveValue(DEFAULT_WEIGHTS.trend);
    expect(screen.getByLabelText(/relevance/i)).toHaveValue(DEFAULT_WEIGHTS.relevance);
    expect(screen.getByLabelText(/refresh cadence/i)).toHaveValue("weekly");
  });

  it("falls back to DEFAULT_WEIGHTS when the project has never been tuned (weights: null)", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(<SettingsForm projectId="proj-1" weights={null} cadence="daily" />);

    expect(screen.getByLabelText(/volume/i)).toHaveValue(DEFAULT_WEIGHTS.volume);
    expect(screen.getByLabelText(/refresh cadence/i)).toHaveValue("daily");
  });

  it("editing one weight and saving POSTs the COMPLETE 5-key numeric weights object plus cadence", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsForm projectId="proj-42" weights={DEFAULT_WEIGHTS} cadence="weekly" />);

    fireEvent.change(screen.getByLabelText(/volume/i), { target: { value: "0.4" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/projects/proj-42/settings");

    const body = JSON.parse(options.body);
    // Completeness assertion (CRITICAL guardrail): every one of the 5 keys
    // must be present with a numeric value, never a partial object.
    expect(Object.keys(body.opportunityWeights).sort()).toEqual([...ALL_WEIGHT_KEYS].sort());
    for (const key of ALL_WEIGHT_KEYS) {
      expect(typeof body.opportunityWeights[key]).toBe("number");
      expect(Number.isNaN(body.opportunityWeights[key])).toBe(false);
    }
    expect(body.opportunityWeights.volume).toBe(0.4);
    expect(body.refreshCadence).toBe("weekly");
  });

  it("changing the cadence and saving includes the new cadence alongside the complete weights", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsForm projectId="proj-7" weights={DEFAULT_WEIGHTS} cadence="weekly" />);

    fireEvent.change(screen.getByLabelText(/refresh cadence/i), { target: { value: "daily" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.refreshCadence).toBe("daily");
    expect(Object.keys(body.opportunityWeights).sort()).toEqual([...ALL_WEIGHT_KEYS].sort());
  });

  it("shows an inline error when the save request fails (res.ok false)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsForm projectId="proj-1" weights={DEFAULT_WEIGHTS} cadence="weekly" />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/couldn.t save/i)).toBeTruthy();
  });
});
