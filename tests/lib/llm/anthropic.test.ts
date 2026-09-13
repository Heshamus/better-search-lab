import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider, type AnthropicLike } from "@/lib/llm/anthropic";
import { LlmError } from "@/lib/llm/provider";

function fakeClient(response: unknown, models: string[] = ["claude-opus-5"]): AnthropicLike & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => response as never);
  return {
    create,
    beta: { messages: { create } },
    models: { list: vi.fn(async () => ({ data: models.map((id) => ({ id })) })) },
  };
}

const textResponse = { content: [{ type: "text", text: "hello " }, { type: "text", text: "world" }], stop_reason: "end_turn", stop_details: null };

describe("AnthropicProvider", () => {
  it("maps system → system, keeps user/assistant turns, sets model/effort/fallbacks, returns joined text", async () => {
    const client = fakeClient(textResponse);
    const p = new AnthropicProvider({ apiKey: "sk", client, effort: "low" });
    const out = await p.chat([
      { role: "system", content: "You are terse." },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
      { role: "user", content: "again" },
    ]);
    expect(out).toBe("hello world");
    const params = client.create.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe("claude-opus-5");
    expect(params.system).toBe("You are terse.");
    expect(params.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
      { role: "user", content: "again" },
    ]);
    expect(params.output_config).toEqual({ effort: "low" });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.max_tokens).toBe(16000);
  });

  it("defaults effort to medium and honors maxTokens", async () => {
    const client = fakeClient(textResponse);
    await new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "user", content: "x" }], { maxTokens: 500 });
    const params = client.create.mock.calls[0][0] as Record<string, unknown>;
    expect(params.output_config).toEqual({ effort: "medium" });
    expect(params.max_tokens).toBe(500);
    // Thinking is adaptive by default on claude-opus-5; sending a `thinking`
    // param would pin it and override what output_config.effort steers.
    expect(params.thinking).toBeUndefined();
    expect(Object.hasOwn(params, "thinking")).toBe(false);
  });

  it("falls back to a plain Messages call when the enhanced params are rejected with a 400", async () => {
    const client = fakeClient(textResponse);
    client.create.mockRejectedValueOnce(Object.assign(new Error("unexpected parameter: output_config"), { status: 400 }));
    const out = await new AnthropicProvider({ apiKey: "sk", client, effort: "low" }).chat([{ role: "user", content: "hi" }]);
    expect(out).toBe("hello world");
    expect(client.create).toHaveBeenCalledTimes(2);
    const enhanced = client.create.mock.calls[0][0] as Record<string, unknown>;
    const retry = client.create.mock.calls[1][0] as Record<string, unknown>;
    expect(enhanced.output_config).toEqual({ effort: "low" });
    expect(retry.output_config).toBeUndefined();
    expect(retry.fallbacks).toBeUndefined();
    expect(retry.betas).toBeUndefined();
    expect(retry.model).toBe("claude-opus-5");
    expect(retry.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("does not fall back on a non-400 error", async () => {
    const client = fakeClient(textResponse);
    client.create.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    await expect(new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 429 });
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it("throws a refusal LlmError carrying the stop_details category", async () => {
    const client = fakeClient({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "no" } });
    await expect(new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "refusal", message: expect.stringContaining("cyber") });
  });

  it("maps SDK errors with a status to http LlmErrors and everything else to transport", async () => {
    const bad = fakeClient(textResponse);
    bad.create.mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }));
    await expect(new AnthropicProvider({ apiKey: "sk", client: bad }).chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 429, kind: "http" });
    bad.create.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(new AnthropicProvider({ apiKey: "sk", client: bad }).chat([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(LlmError);
  });

  it("rejects a conversation with no user turn", async () => {
    const client = fakeClient(textResponse);
    await expect(new AnthropicProvider({ apiKey: "sk", client }).chat([{ role: "system", content: "only" }])).rejects.toThrow(/user/);
    expect(client.create).not.toHaveBeenCalled();
  });

  it("lists models", async () => {
    const client = fakeClient(textResponse, ["claude-opus-5", "claude-sonnet-5"]);
    expect(await new AnthropicProvider({ apiKey: "sk", client }).listModels()).toEqual(["claude-opus-5", "claude-sonnet-5"]);
  });
});
