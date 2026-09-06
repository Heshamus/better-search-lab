import Anthropic from "@anthropic-ai/sdk";
import type { EffortLevel } from "@/lib/config/app-config";
import { LlmError, type ChatMessage, type ChatProvider } from "./provider";

// Native Anthropic adapter on the official SDK (never an OpenAI-compatible shim).
// Thinking is adaptive by default on claude-opus-5, so no `thinking` param;
// depth is steered with output_config.effort. The server-side refusal fallback
// is on by default (fallbacks: "default" + its beta header) so a policy decline
// reruns on a fallback model inside the same call; a final refusal still
// surfaces as an LlmError so callers degrade honestly.

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TOKENS = 16000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  stop_details?: { type?: string; category?: string | null; explanation?: string } | null;
}

/** The slice of the SDK client this adapter uses — injectable for tests. */
export interface AnthropicLike {
  beta: { messages: { create(params: Record<string, unknown>): Promise<AnthropicMessage> } };
  models: { list(params?: { limit?: number }): Promise<{ data: { id: string }[] }> };
}

export class AnthropicProvider implements ChatProvider {
  private client: AnthropicLike;
  private model: string;
  private effort: EffortLevel;

  constructor(cfg: { apiKey: string; model?: string; effort?: EffortLevel; client?: AnthropicLike }) {
    this.client = cfg.client ?? (new Anthropic({ apiKey: cfg.apiKey }) as unknown as AnthropicLike);
    this.model = cfg.model || ANTHROPIC_DEFAULT_MODEL;
    this.effort = cfg.effort ?? "medium";
  }

  async chat(messages: ChatMessage[], opts?: { maxTokens?: number }): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));
    if (!turns.some((t) => t.role === "user")) throw new LlmError("conversation needs at least one user message", 0, undefined, "transport");

    let res: AnthropicMessage;
    try {
      res = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: this.effort },
        ...(system ? { system } : {}),
        messages: turns,
      });
    } catch (e) {
      const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 0;
      throw new LlmError(`anthropic: ${(e as Error)?.message ?? e}`, status, undefined, status ? "http" : "transport");
    }
    if (res.stop_reason === "refusal") {
      const category = res.stop_details?.category ?? "unspecified";
      throw new LlmError(`anthropic refused the request (category: ${category})`, 200, res.stop_details ?? undefined, "refusal");
    }
    return res.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }

  async listModels(): Promise<string[]> {
    try {
      const page = await this.client.models.list({ limit: 100 });
      return page.data.map((m) => m.id);
    } catch {
      return [];
    }
  }
}
