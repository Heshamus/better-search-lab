import { describe, it, expect, vi } from "vitest";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { LlmError } from "@/lib/llm/provider";

function completion(content: string, reasoning = "chain of thought") {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", reasoning_content: reasoning, content }, finish_reason: "stop" }] }),
    { status: 200 },
  );
}

describe("OpenAICompatibleProvider.chat", () => {
  it("POSTs to <baseUrl>/chat/completions with Bearer auth, the model, and returns message.content (not reasoning_content)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion("hello answer"));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com/", apiKey: "sk-test", model: "deepseek-v4-pro", fetchImpl });
    expect(await p.chat([{ role: "user", content: "hi" }])).toBe("hello answer");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("deepseek-v4-pro");
    expect(sent.max_tokens).toBe(4000);
  });

  it("omits the Authorization header when no key is configured (local Ollama)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion("ok"));
    const p = new OpenAICompatibleProvider({ baseUrl: "http://localhost:11434/v1", model: "llama3.1", fetchImpl });
    await p.chat([{ role: "user", content: "x" }]);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(completion("ok"));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl });
    expect(await p.chat([{ role: "user", content: "x" }])).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("swaps to max_completion_tokens and retries when a provider 400s rejecting max_tokens (OpenAI gpt-5/o-series)", async () => {
    const err = new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", param: "max_tokens", code: "unsupported_parameter" } }), { status: 400 });
    const fetchImpl = vi.fn().mockResolvedValueOnce(err).mockResolvedValueOnce(completion("done"));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://api.openai.com/v1", apiKey: "sk", model: "gpt-5", fetchImpl });
    expect(await p.chat([{ role: "user", content: "hi" }])).toBe("done");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(first.max_tokens).toBe(4000);
    expect(first.max_completion_tokens).toBeUndefined();
    expect(second.max_completion_tokens).toBe(4000);
    expect(second.max_tokens).toBeUndefined();
  });

  it("does not swap on an unrelated 400, and swaps at most once", async () => {
    const unrelated = new Response(JSON.stringify({ error: { message: "invalid model id" } }), { status: 400 });
    const fetchImpl = vi.fn().mockResolvedValue(unrelated);
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl });
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 400, kind: "http" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws LlmError with the status after retries are exhausted, and on transport failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl });
    await expect(p.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ status: 500, kind: "http" });
    const dead = new OpenAICompatibleProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    await expect(dead.chat([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(LlmError);
    await expect(dead.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "transport" });
  });

  it("lists models from GET <baseUrl>/models and returns [] when the endpoint fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }, { nope: 1 }] }), { status: 200 }));
    const p = new OpenAICompatibleProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m", fetchImpl });
    expect(await p.listModels()).toEqual(["a", "b"]);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://x/v1/models");
    const broken = new OpenAICompatibleProvider({ baseUrl: "https://x/v1", apiKey: "k", model: "m", fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 404 })) });
    expect(await broken.listModels()).toEqual([]);
  });
});
