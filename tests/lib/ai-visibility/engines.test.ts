import { describe, it, expect, vi } from "vitest";
import { EdenClient, measuredEngines } from "@/lib/ai-visibility/engines";

describe("EdenClient.ask", () => {
  it("POSTs to the Eden gateway with Bearer auth and returns answer + URL-filtered citations", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Northwind is a good option." } }],
          citations: ["https://example-site.com/x", "not-a-url", "https://other.com/y"],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const client = new EdenClient("k", fetchImpl);
    const out = await client.ask("perplexityai/sonar", "best ai seo tool?");
    expect(out).toEqual({ answer: "Northwind is a good option.", citations: ["https://example-site.com/x", "https://other.com/y"] });

    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(String(url)).toBe("https://api.edenai.run/v2/llm/chat");
    expect((init.headers as any).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body).model).toBe("perplexityai/sonar");
  });

  it("falls back to search_results[].url when there is no top-level citations", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "x" } }], search_results: [{ url: "https://a.io/p" }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const out = await new EdenClient("k", fetchImpl).ask("openai/gpt-4o-mini", "q");
    expect(out.citations).toEqual(["https://a.io/p"]);
  });

  it("throws on a non-OK response so the scan can count it as 0 answers", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(new EdenClient("k", fetchImpl).ask("m", "q")).rejects.toThrow(/eden 500/);
  });
});

describe("measuredEngines", () => {
  it("returns the three default engines", () => {
    const engines = measuredEngines({});
    expect(engines.map((e) => e.id)).toEqual(["perplexity", "chatgpt", "gemini"]);
    expect(engines[0].model).toBe("perplexityai/sonar");
  });
  it("honors model overrides", () => {
    expect(measuredEngines({ EDEN_SONAR_MODEL: "perplexityai/sonar-pro" })[0].model).toBe("perplexityai/sonar-pro");
  });
});
