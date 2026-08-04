import { describe, it, expect, vi } from "vitest";
import { DeepSeekClient, extractNicheSeeds } from "@/lib/llm/deepseek";

// A canned OpenAI-compatible chat-completion whose message carries BOTH the
// reasoning trace and the final answer. `content` is what extractNicheSeeds must
// read; `reasoning_content` must be ignored. ZERO live LLM spend — fixture only.
function completion(content: string, reasoning = "some chain-of-thought here") {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", reasoning_content: reasoning, content }, finish_reason: "stop" }],
    }),
    { status: 200 },
  );
}

const PAGES = [{ url: "https://harperflow.io/", html: "<html><head><title>AI SEO Automation for Webflow</title></head><body><h1>Programmatic GEO content</h1></body></html>" }];

describe("DeepSeekClient.chat", () => {
  it("sends Bearer auth + the reasoning model and returns message.content (not reasoning_content)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion("hello answer"));
    const c = new DeepSeekClient({ apiKey: "sk-test", fetchImpl });
    const out = await c.chat([{ role: "user", content: "hi" }]);
    expect(out).toBe("hello answer"); // content, NOT reasoning_content
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("api.deepseek.com/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("deepseek-v4-pro");
    expect(sent.max_tokens).toBe(4000); // generous so reasoning + JSON both fit
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(completion("ok"));
    const c = new DeepSeekClient({ apiKey: "sk", fetchImpl });
    expect(await c.chat([{ role: "user", content: "x" }])).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("extractNicheSeeds", () => {
  it("parses seeds + nicheTerms from the model's JSON content", async () => {
    const content = '{"seeds":["ai seo content automation","webflow programmatic seo"],"nicheTerms":["seo","webflow","content","automation","geo"]}';
    const fetchImpl = vi.fn().mockResolvedValue(completion(content));
    const client = new DeepSeekClient({ apiKey: "sk", fetchImpl });

    const { seeds, nicheTerms } = await extractNicheSeeds(client, { pages: PAGES, domain: "harperflow.io" });
    expect(seeds).toEqual(["ai seo content automation", "webflow programmatic seo"]);
    expect(nicheTerms).toEqual(["seo", "webflow", "content", "automation", "geo"]);
  });

  it("tolerates ```json fences around the object", async () => {
    const content = "```json\n{\"seeds\":[\"webflow seo\"],\"nicheTerms\":[\"seo\",\"webflow\"]}\n```";
    const fetchImpl = vi.fn().mockResolvedValue(completion(content));
    const client = new DeepSeekClient({ apiKey: "sk", fetchImpl });
    const { seeds, nicheTerms } = await extractNicheSeeds(client, { pages: PAGES, domain: "harperflow.io" });
    expect(seeds).toEqual(["webflow seo"]);
    expect(nicheTerms).toEqual(["seo", "webflow"]);
  });

  it("throws on empty/garbage content (caller falls back to heuristic seeds)", async () => {
    const client = new DeepSeekClient({ apiKey: "sk", fetchImpl: vi.fn().mockResolvedValue(completion("")) });
    await expect(extractNicheSeeds(client, { pages: PAGES, domain: "d.io" })).rejects.toThrow();

    const client2 = new DeepSeekClient({ apiKey: "sk", fetchImpl: vi.fn().mockResolvedValue(completion("I could not analyze this site.")) });
    await expect(extractNicheSeeds(client2, { pages: PAGES, domain: "d.io" })).rejects.toThrow();
  });

  it("throws when the JSON parses but the arrays are empty", async () => {
    const client = new DeepSeekClient({ apiKey: "sk", fetchImpl: vi.fn().mockResolvedValue(completion('{"seeds":[],"nicheTerms":[]}')) });
    await expect(extractNicheSeeds(client, { pages: PAGES, domain: "d.io" })).rejects.toThrow();
  });
});
