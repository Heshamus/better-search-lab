// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { SiteStep } from "@/components/setup/site-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockClear(); refresh.mockClear(); document.cookie = "sp_project=; max-age=0; path=/"; });

describe("SiteStep", () => {
  it("creates the project with the chosen market and device, makes it current, and continues", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "p9", name: "Northwind", domain: "example-site.com" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SiteStep />);
    fireEvent.change(screen.getByLabelText(/site name/i), { target: { value: "Northwind" } });
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: "https://www.example-site.com/" } });
    fireEvent.change(screen.getByLabelText(/market/i), { target: { value: "2826" } });
    fireEvent.change(screen.getByLabelText(/device/i), { target: { value: "mobile" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/setup"));
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ name: "Northwind", domain: "example-site.com", locationCode: 2826, languageCode: "en", device: "mobile" });
    expect(document.cookie).toContain("sp_project=p9");
  });
  it("shows the server's validation message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "domain is required" }), { status: 400 })));
    render(<SiteStep />);
    fireEvent.change(screen.getByLabelText(/site name/i), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/domain/i), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("domain is required");
    expect(push).not.toHaveBeenCalled();
  });
});
