// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CompetitorSuggestions } from "@/components/competitor-suggestions";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

const suggestBody = { suggestions: [{ domain: "rival-one.example", intersections: 120, avgPosition: 6.5 }, { domain: "rival-two.example", intersections: 40, avgPosition: null }] };

describe("CompetitorSuggestions", () => {
  it("fetches suggestions on click and renders overlap and position", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(suggestBody), { status: 200 })));
    render(<CompetitorSuggestions projectId="p1" atCap={false} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest competitors/i }));
    const row = await screen.findByTestId("suggestion-rival-one.example");
    expect(within(row).getByText("rival-one.example")).toBeInTheDocument();
    expect(within(row).getByText(/120 shared keywords/)).toBeInTheDocument();
    expect(within(row).getByText(/avg\. position 6\.5/)).toBeInTheDocument();
    expect(within(screen.getByTestId("suggestion-rival-two.example")).getByText(/avg\. position —/)).toBeInTheDocument();
  });

  it("adds a suggestion through the competitors route, removes the row, and refreshes", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).endsWith("/suggest")
        ? new Response(JSON.stringify(suggestBody), { status: 200 })
        : new Response(JSON.stringify({ competitor: { id: "c1", domain: "rival-one.example" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onAdded = vi.fn();
    render(<CompetitorSuggestions projectId="p1" atCap={false} onAdded={onAdded} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest competitors/i }));
    const row = await screen.findByTestId("suggestion-rival-one.example");
    fireEvent.click(within(row).getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(screen.queryByTestId("suggestion-rival-one.example")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/competitors", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[1] as any)[1].body)).toEqual({ domain: "rival-one.example" });
    expect(refresh).toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledWith("rival-one.example");
  });

  it("shows the server's message on 503 and disables Add at the cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "DataForSEO is not configured. Connect it in Settings → Integrations." }), { status: 503 })));
    render(<CompetitorSuggestions projectId="p1" atCap={true} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest competitors/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not configured/);
  });
});
