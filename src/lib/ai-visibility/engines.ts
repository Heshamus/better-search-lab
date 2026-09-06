import type { EngineAnswer, EngineId } from "./types";

/** US/English forcing, so answers are comparable across scans and engines. */
export const LOCALE_HINT = "Answer for a United States audience using English-language, US-relevant sources.";

/**
 * Eden AI gateway (POST /v2/llm/chat) — one funded key, three measured engines.
 * Perplexity models return native citations (top-level `citations` or
 * `search_results[].url`); OpenAI/Gemini return answers only, which is honest —
 * those products don't expose live sources. Ported from an earlier internal
 * citation engine.
 */
export class EdenClient {
  constructor(
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async ask(model: string, prompt: string, opts: { timeoutMs?: number } = {}): Promise<EngineAnswer> {
    const resp = await this.fetchImpl("https://api.edenai.run/v2/llm/chat", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: LOCALE_HINT },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`eden ${resp.status}: ${body.slice(0, 200)}`);
    }
    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: unknown[];
      search_results?: Array<{ url?: string }>;
    };
    const answer = json.choices?.[0]?.message?.content ?? "";
    const citations = (json.citations ?? json.search_results?.map((s) => s.url) ?? [])
      .map(String)
      .filter((u) => /^https?:\/\//.test(u));
    return { answer, citations };
  }
}

/** The measured-engine roster — ids are stable (analytics + report copy key on them). */
export function measuredEngines(env: {
  EDEN_SONAR_MODEL?: string;
  EDEN_CHATGPT_MODEL?: string;
  EDEN_GEMINI_MODEL?: string;
}): Array<{ id: EngineId; model: string }> {
  return [
    { id: "perplexity", model: env.EDEN_SONAR_MODEL ?? "perplexityai/sonar" },
    { id: "chatgpt", model: env.EDEN_CHATGPT_MODEL ?? "openai/gpt-4o-mini" },
    { id: "gemini", model: env.EDEN_GEMINI_MODEL ?? "google/gemini-2.5-flash" },
  ];
}
