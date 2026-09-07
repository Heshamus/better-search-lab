// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { DoneStep } from "@/components/setup/done-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); });

describe("DoneStep", () => {
  it("records completion then opens the overview", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DoneStep projectName="Northwind" />);
    expect(screen.getByRole("heading")).toHaveTextContent(/Northwind/);
    fireEvent.click(screen.getByRole("button", { name: /open overview/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(fetchMock).toHaveBeenCalledWith("/api/setup/state", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ completed: true });
  });
  it("still opens the overview for a member (whose completion POST is refused)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    render(<DoneStep projectName="Northwind" />);
    fireEvent.click(screen.getByRole("button", { name: /open overview/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
  });
  it("still opens the overview when the completion POST throws", async () => {
    // A rejection, not a non-ok response: the component ignores the status, so
    // only a throw exercises the catch that keeps navigation unconditional.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<DoneStep projectName="Northwind" />);
    fireEvent.click(screen.getByRole("button", { name: /open overview/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/overview"));
    expect(screen.getByRole("button", { name: /open overview/i })).toBeEnabled();
  });
});
