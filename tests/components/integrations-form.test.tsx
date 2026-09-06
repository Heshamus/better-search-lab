// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { IntegrationsForm } from "@/components/integrations-form";
import type { IntegrationsView } from "@/lib/config/view";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const view: IntegrationsView = {
  groups: [
    {
      id: "dataforseo", label: "DataForSEO", description: "The data backbone.", configured: true,
      fields: [
        { key: "dataforseo.login", env: "DATAFORSEO_LOGIN", label: "Login", description: "", secret: false, set: true, source: "env", value: "env-login", undecryptable: false },
        { key: "dataforseo.password", env: "DATAFORSEO_PASSWORD", label: "API password", description: "", secret: true, set: true, source: "db", undecryptable: false },
      ],
    },
    {
      id: "llm", label: "AI assistant", description: "Powers things.", configured: false,
      fields: [
        { key: "llm.provider", env: "LLM_PROVIDER", label: "Provider", description: "", secret: false, set: false, source: null, options: ["deepseek", "openai", "anthropic", "openrouter", "groq", "together", "gemini", "ollama", "custom"], undecryptable: false },
        { key: "llm.baseUrl", env: "LLM_BASE_URL", label: "Base URL", description: "", secret: false, set: false, source: null, undecryptable: false },
        { key: "llm.apiKey", env: "LLM_API_KEY", label: "API key", description: "", secret: true, set: false, source: null, undecryptable: false },
        { key: "llm.model", env: "LLM_MODEL", label: "Model", description: "", secret: false, set: false, source: null, undecryptable: false },
        { key: "llm.effort", env: "LLM_EFFORT", label: "Effort", description: "", secret: false, set: false, source: null, options: ["low", "medium", "high"], undecryptable: false },
      ],
    },
    {
      id: "edenai", label: "Eden AI", description: "", configured: false,
      fields: [{ key: "edenai.apiKey", env: "EDENAI_API_KEY", label: "API key", description: "", secret: true, set: false, source: null, undecryptable: true, problem: undefined }],
    },
  ],
};

describe("IntegrationsForm", () => {
  it("renders env-overridden fields read-only with the badge, masks set secrets behind Replace, and flags undecryptable rows", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-dataforseo");
    const login = within(card).getByLabelText("Login") as HTMLInputElement;
    expect(login).toBeDisabled();
    expect(login.value).toBe("env-login");
    expect(within(card).getByText(/set via DATAFORSEO_LOGIN/)).toBeInTheDocument();
    expect(within(card).getByText(/•••/)).toBeInTheDocument();
    expect(within(card).queryByLabelText("API password")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /replace/i }));
    expect(within(card).getByLabelText("API password")).toBeInTheDocument();
    expect(within(screen.getByTestId("integration-edenai")).getByText(/could not decrypt/i)).toBeInTheDocument();
  });

  it("saves only the edited fields of one card and shows the response state", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(view), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-llm");
    fireEvent.change(within(card).getByLabelText("Provider"), { target: { value: "ollama" } });
    expect((within(card).getByLabelText("Base URL") as HTMLInputElement).value).toBe("http://localhost:11434/v1");
    expect((within(card).getByLabelText("Model") as HTMLInputElement).value).toBe("llama3.1");
    fireEvent.click(within(card).getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe("/api/settings/integrations");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ values: { "llm.provider": "ollama", "llm.baseUrl": "http://localhost:11434/v1", "llm.model": "llama3.1" } });
    expect(await within(card).findByText(/saved/i)).toBeInTheDocument();
  });

  it("runs Test and shows the detail, in either outcome", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, detail: "DataForSEO 401" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-dataforseo");
    fireEvent.click(within(card).getByRole("button", { name: /^test$/i }));
    expect(await within(card).findByText(/DataForSEO 401/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/integrations/dataforseo/test", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces a PUT error inline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "must be an http(s) URL" }), { status: 400 })));
    render(<IntegrationsForm view={view} />);
    const card = screen.getByTestId("integration-llm");
    fireEvent.change(within(card).getByLabelText("Base URL"), { target: { value: "nope" } });
    fireEvent.click(within(card).getByRole("button", { name: /^save$/i }));
    expect(await within(card).findByRole("alert")).toHaveTextContent(/http\(s\) URL/);
  });
});
