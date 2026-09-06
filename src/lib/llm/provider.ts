import { LLM_PRESETS, LLM_PROVIDERS, type LlmPreset, type LlmProviderId } from "@/lib/config/registry";

export { LLM_PRESETS, LLM_PROVIDERS };
export type { LlmPreset, LlmProviderId };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The one seam every LLM consumer depends on. Adapters: openai-compatible.ts, anthropic.ts. */
export interface ChatProvider {
  chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string>;
  listModels(): Promise<string[]>;
}

export type ChatFn = (messages: ChatMessage[]) => Promise<string>;

export class LlmError extends Error {
  constructor(
    msg: string,
    readonly status: number,
    readonly body?: unknown,
    readonly kind: "http" | "refusal" | "transport" = "http",
  ) {
    super(msg);
    this.name = "LlmError";
  }
}
