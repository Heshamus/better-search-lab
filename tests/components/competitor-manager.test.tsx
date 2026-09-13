// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CompetitorManager } from "@/components/competitor-manager";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

describe("CompetitorManager", () => {
  it("renders rows and posts a new competitor with { domain }", async () => {
    render(<CompetitorManager projectId="p1" competitors={[{ id: "1", domain: "rival-a.com" }]} />);
    expect(screen.getByText("rival-a.com")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/competitor domain/i), { target: { value: "rival-b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/p1/competitors",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ domain: "rival-b.com" }),
        }),
      ),
    );
  });

  it("disables adding at the cap", () => {
    const atCap = Array.from({ length: 10 }, (_, i) => ({ id: String(i), domain: `d${i}.com` }));
    render(<CompetitorManager projectId="p1" competitors={atCap} />);
    expect(screen.getByText(/maximum 10 competitors/i)).toBeTruthy();
    expect((screen.getByPlaceholderText(/competitor domain/i) as HTMLInputElement).disabled).toBe(true);
  });

  it("surfaces 'Maximum 10 competitors' on a 409 from POST, distinct from a generic error", async () => {
    (global.fetch as any) = vi.fn(
      async () => new Response(JSON.stringify({ error: "competitor limit reached (max 10)" }), { status: 409 }),
    );
    // Deliberately under the client-side cap (4, well under 10) so this exercises the
    // *server* 409 branch — not the client-side atCap disable from the test
    // above, which would never let the click reach fetch at all.
    const four = ["a", "b", "c", "d"].map((d, i) => ({ id: String(i), domain: `${d}.com` }));
    render(<CompetitorManager projectId="p1" competitors={four} />);
    fireEvent.change(screen.getByPlaceholderText(/competitor domain/i), { target: { value: "e.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(await screen.findByText(/maximum 10 competitors/i)).toBeTruthy();
    // Not the generic failure copy — the 409 path must be distinguishable.
    expect(screen.queryByText(/couldn.t add competitor/i)).toBeNull();
  });

  it("shows a generic inline error (not the cap message) on a non-409 failure", async () => {
    (global.fetch as any) = vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    render(<CompetitorManager projectId="p1" competitors={[{ id: "1", domain: "rival-a.com" }]} />);
    fireEvent.change(screen.getByPlaceholderText(/competitor domain/i), { target: { value: "rival-b.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(await screen.findByText(/couldn.t add competitor/i)).toBeTruthy();
    expect(screen.queryByText(/maximum 10 competitors/i)).toBeNull();
  });

  it("clicking a row's Delete posts DELETE with { competitorId }", async () => {
    render(<CompetitorManager projectId="p1" competitors={[{ id: "c1", domain: "rival-a.com" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/projects/p1/competitors",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ competitorId: "c1" }),
        }),
      ),
    );
  });
});
