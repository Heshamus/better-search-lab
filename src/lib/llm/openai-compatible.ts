import { LlmError, type ChatMessage, type ChatProvider } from "./provider";

// Any OpenAI-compatible chat-completions endpoint: DeepSeek, OpenAI, OpenRouter,
// Groq, Together, Gemini's compatibility endpoint, a local Ollama, or a custom
// base URL. Reasoning models (DeepSeek) return BOTH message.reasoning_content and
// message.content; we read `content` only, and budget max_tokens generously so
// the reasoning pass never starves the answer.

const DEFAULT_MAX_TOKENS = 4000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OpenAICompatibleProvider implements ChatProvider {
  private baseUrl: string;
  private apiKey?: string;
  private model: string;
  private fetchImpl: typeof fetch;
  private maxTokens: number;

  constructor(cfg: { baseUrl: string; apiKey?: string; model: string; fetchImpl?: typeof fetch; maxTokens?: number }) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.apiKey = cfg.apiKey || undefined;
    this.model = cfg.model;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.maxTokens = cfg.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> {
    const maxTokens = opts?.maxTokens ?? this.maxTokens;
    // Most OpenAI-compatible backends take `max_tokens`; OpenAI's own newer
    // models (gpt-5, the o-series) reject it and require `max_completion_tokens`.
    // Send `max_tokens`, and if a provider 400s naming the other field, swap
    // once and retry — no per-provider configuration needed.
    let tokenField: "max_tokens" | "max_completion_tokens" = "max_tokens";
    let swapped = false;
    for (let attempt = 0; ; attempt++) {
      const body = { model: this.model, messages, [tokenField]: maxTokens };
      let r: Response;
      try {
        r = await this.fetchImpl(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
      } catch (e) {
        throw new LlmError(`LLM unreachable: ${(e as Error)?.message ?? e}`, 0, undefined, "transport");
      }
      if (r.ok) {
        const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        return json?.choices?.[0]?.message?.content ?? "";
      }
      const errBody = await r.json().catch(() => undefined);
      if (r.status === 400 && !swapped && tokenField === "max_tokens" && JSON.stringify(errBody ?? "").includes("max_completion_tokens")) {
        tokenField = "max_completion_tokens";
        swapped = true;
        attempt--; // the parameter swap isn't a real attempt; keep the 429/5xx retry budget
        continue;
      }
      const retryable = r.status === 429 || r.status >= 500;
      if (retryable && attempt < 1) { await sleep(200 * 2 ** attempt); continue; }
      throw new LlmError(`LLM ${r.status}`, r.status, errBody, "http");
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const r = await this.fetchImpl(`${this.baseUrl}/models`, { headers: this.headers() });
      if (!r.ok) return [];
      const json = (await r.json()) as { data?: { id?: unknown }[] };
      return (json.data ?? []).map((d) => d.id).filter((id): id is string => typeof id === "string");
    } catch {
      return [];
    }
  }
}
