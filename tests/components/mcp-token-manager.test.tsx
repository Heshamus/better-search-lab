// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// McpTokenManager calls useRouter().refresh() after a successful generate/
// revoke, so the hook needs the same jsdom-friendly mock every other client
// component test in this suite uses (mirrors reddit-brief-editor.test.tsx /
// reddit-conversations.test.tsx). `refreshMock` is hoisted to a single
// stable reference shared across every `useRouter()` call.
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { McpTokenManager, type McpTokenSummary } from "@/components/mcp-token-manager";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshMock.mockClear();
});

const seededTokens: McpTokenSummary[] = [
  { id: "t1", label: "Claude Desktop", createdAt: "2026-08-01T00:00:00.000Z", lastUsedAt: "2026-08-05T00:00:00.000Z" },
  { id: "t2", label: null, createdAt: "2026-08-02T00:00:00.000Z", lastUsedAt: null },
];

describe("McpTokenManager", () => {
  it("renders seeded tokens: label or 'unlabeled', created date, last-used or 'never'", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<McpTokenManager tokens={seededTokens} />);

    expect(screen.getByText(/claude desktop/i)).toBeTruthy();
    expect(screen.getByText(/unlabeled/i)).toBeTruthy();
    expect(screen.getByText(/2026-08-01/)).toBeTruthy();
    expect(screen.getByText(/never/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /revoke/i })).toHaveLength(2);
  });

  it("renders an honest empty state with zero tokens", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<McpTokenManager tokens={[]} />);
    expect(screen.getByText(/no tokens yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /revoke/i })).toBeNull();
  });

  it("Generate POSTs the label and renders the returned token string exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ token: "bsl_freshplaintext" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={[]} />);

    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: "Claude Desktop" } });
    fireEvent.click(screen.getByRole("button", { name: /generate token/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mcp-tokens");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options.body)).toEqual({ label: "Claude Desktop" });

    expect(await screen.findByText("bsl_freshplaintext")).toBeTruthy();
    expect(screen.getAllByText("bsl_freshplaintext")).toHaveLength(1);
    expect(screen.getByText(/you won.t be able to see it again/i)).toBeTruthy();

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("Generate with a blank label omits it from the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ token: "bsl_x" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /generate token/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({});
  });

  it("copying the minted token writes it to the clipboard and shows Copied", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ token: "bsl_abc" }) });
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<McpTokenManager tokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /generate token/i }));
    await screen.findByText("bsl_abc");

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("bsl_abc"));
    expect(await screen.findByText(/^copied$/i)).toBeTruthy();
  });

  it("shows 'Copy failed' (never 'Copied') when the clipboard write rejects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ token: "bsl_abc" }) });
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<McpTokenManager tokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /generate token/i }));
    await screen.findByText("bsl_abc");

    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    expect(await screen.findByText(/copy failed/i)).toBeTruthy();
    expect(screen.queryByText(/^copied$/i)).toBeNull();
  });

  it("a failed generate shows an honest error, not a fake token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /generate token/i }));

    expect(await screen.findByText(/couldn.t generate/i)).toBeTruthy();
    expect(screen.queryByText(/you won.t be able to see it again/i)).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("a network error on generate shows an honest error, not a fake token", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /generate token/i }));

    expect(await screen.findByText(/couldn.t generate/i)).toBeTruthy();
    expect(screen.queryByText(/you won.t be able to see it again/i)).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("Revoke DELETEs the specific token's id and refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={seededTokens} />);
    fireEvent.click(screen.getAllByRole("button", { name: /revoke/i })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mcp-tokens?id=t1");
    expect(options.method).toBe("DELETE");

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("disables a token's Revoke button while its request is in flight", async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={seededTokens} />);
    const revokeButtons = screen.getAllByRole("button", { name: /revoke/i });
    fireEvent.click(revokeButtons[0]);

    await waitFor(() => expect(revokeButtons[0]).toBeDisabled());
    resolveFetch({ ok: true });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("shows an honest error and does not refresh when revoke fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);

    render(<McpTokenManager tokens={seededTokens} />);
    fireEvent.click(screen.getAllByRole("button", { name: /revoke/i })[0]);

    expect(await screen.findByText(/couldn.t revoke/i)).toBeTruthy();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
