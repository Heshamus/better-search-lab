// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DataForSeoStep } from "@/components/setup/dataforseo-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

function fill() {
  fireEvent.change(screen.getByLabelText(/login/i), { target: { value: "me@example.com" } });
  fireEvent.change(screen.getByLabelText(/api password/i), { target: { value: "hunter2hunter2" } });
  fireEvent.click(screen.getByRole("button", { name: /test & save/i }));
}

describe("DataForSeoStep", () => {
  it("saves through the Integrations PUT, tests, shows the balance, and moves on", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ groups: [] }), { status: 200 })
        : new Response(JSON.stringify({ ok: true, detail: "Connected — $42.10 balance (me@example.com)" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<DataForSeoStep />);
    fill();
    expect(await screen.findByText(/\$42\.10 balance/)).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ values: { "dataforseo.login": "me@example.com", "dataforseo.password": "hunter2hunter2" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/integrations/dataforseo/test", expect.objectContaining({ method: "POST" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("shows the provider's own failure, clears the saved credentials, and does not move on", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT" ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ ok: false, detail: "DataForSEO 401" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DataForSeoStep />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent("DataForSEO 401");
    expect(refresh).not.toHaveBeenCalled();
    // The test ran against the stored credentials, so a second PUT must null them
    // out — otherwise the install counts as configured and the wizard skips this step.
    const puts = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(JSON.parse((puts[1] as any)[1].body)).toEqual({ values: { "dataforseo.login": null, "dataforseo.password": null } });
  });
  it("surfaces a PUT rejection (an env override) inline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Login is set via the environment variable DATAFORSEO_LOGIN; change it there." }), { status: 400 })));
    render(<DataForSeoStep />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/DATAFORSEO_LOGIN/);
  });
});
