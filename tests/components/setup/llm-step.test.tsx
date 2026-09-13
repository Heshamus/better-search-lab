// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { LlmStep } from "@/components/setup/llm-step";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockClear(); });

describe("LlmStep", () => {
  it("fills base URL and model from the preset, saves, tests, records done", async () => {
    const calls: { url: string; body?: any; method?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/llm/test")) return new Response(JSON.stringify({ ok: true, detail: "deepseek-chat answered" }), { status: 200 });
      return new Response("{}", { status: 200 });
    }));
    render(<LlmStep />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "deepseek" } });
    expect((screen.getByLabelText(/model/i) as HTMLInputElement).value).toBe("deepseek-chat");
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "sk-test" } });
    fireEvent.click(screen.getByRole("button", { name: /test & continue/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls[0]).toMatchObject({ url: "/api/settings/integrations", method: "PUT", body: { values: { "llm.provider": "deepseek", "llm.baseUrl": "https://api.deepseek.com", "llm.apiKey": "sk-test", "llm.model": "deepseek-chat" } } });
    expect(calls[1]).toMatchObject({ url: "/api/settings/integrations/llm/test", method: "POST" });
    expect(calls[2]).toMatchObject({ url: "/api/setup/state", method: "POST", body: { llmStep: "done" } });
  });
  it("Skip records skipped without saving anything", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LlmStep />);
    fireEvent.click(screen.getByRole("button", { name: /skip for now/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body)).toEqual({ llmStep: "skipped" });
  });
  it("shows the provider's failure, clears the saved settings, and stays", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      String(url).endsWith("/llm/test") ? new Response(JSON.stringify({ ok: false, detail: "LLM 401" }), { status: 200 }) : new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LlmStep />);
    fireEvent.change(screen.getByLabelText(/provider/i), { target: { value: "openai" } });
    fireEvent.change(screen.getByLabelText(/api key/i), { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByRole("button", { name: /test & continue/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("LLM 401");
    expect(refresh).not.toHaveBeenCalled();
    // The test ran against the stored settings, so a second PUT must null out
    // every key the first PUT wrote — otherwise the provider counts as configured.
    const puts = fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "PUT");
    expect(puts).toHaveLength(2);
    const saved = JSON.parse((puts[0] as any)[1].body).values as Record<string, string>;
    const cleared = JSON.parse((puts[1] as any)[1].body).values as Record<string, null>;
    expect(Object.keys(cleared).sort()).toEqual(Object.keys(saved).sort());
    expect(Object.values(cleared).every((v) => v === null)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/setup/state", expect.anything());
  });
});
