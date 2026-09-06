import { describe, it, expect, vi } from "vitest";
import { extractNicheSeeds, judgeRelevance } from "@/lib/llm/niche";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";

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

const PAGES = [{ url: "https://example-site.com/", html: "<html><head><title>AI SEO Automation for Webflow</title></head><body><h1>Programmatic GEO content</h1></body></html>" }];

describe("extractNicheSeeds", () => {
  it("parses seeds + nicheTerms from the model's JSON content", async () => {
    const content = '{"seeds":["ai seo content automation","webflow programmatic seo"],"nicheTerms":["seo","webflow","content","automation","geo"]}';
    const fetchImpl = vi.fn().mockResolvedValue(completion(content));
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });

    const { seeds, nicheTerms } = await extractNicheSeeds(client, { pages: PAGES, domain: "example-site.com" });
    expect(seeds).toEqual(["ai seo content automation", "webflow programmatic seo"]);
    expect(nicheTerms).toEqual(["seo", "webflow", "content", "automation", "geo"]);
  });

  it("tolerates ```json fences around the object", async () => {
    const content = "```json\n{\"seeds\":[\"webflow seo\"],\"nicheTerms\":[\"seo\",\"webflow\"]}\n```";
    const fetchImpl = vi.fn().mockResolvedValue(completion(content));
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { seeds, nicheTerms } = await extractNicheSeeds(client, { pages: PAGES, domain: "example-site.com" });
    expect(seeds).toEqual(["webflow seo"]);
    expect(nicheTerms).toEqual(["seo", "webflow"]);
  });

  it("throws on empty/garbage content (caller falls back to heuristic seeds)", async () => {
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl: vi.fn().mockResolvedValue(completion("")) });
    await expect(extractNicheSeeds(client, { pages: PAGES, domain: "d.io" })).rejects.toThrow();

    const client2 = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl: vi.fn().mockResolvedValue(completion("I could not analyze this site.")) });
    await expect(extractNicheSeeds(client2, { pages: PAGES, domain: "d.io" })).rejects.toThrow();
  });

  it("throws when the JSON parses but the arrays are empty", async () => {
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl: vi.fn().mockResolvedValue(completion('{"seeds":[],"nicheTerms":[]}')) });
    await expect(extractNicheSeeds(client, { pages: PAGES, domain: "d.io" })).rejects.toThrow();
  });
});

const NICHE = { domain: "example-site.com", seeds: ["webflow seo automation"], nicheTerms: ["seo", "webflow", "geo"] };

describe("judgeRelevance", () => {
  it("maps returned indices back to the EXACT original candidates", async () => {
    // 1-based indices → keep candidates 1 and 3; the token-bridge "people search"
    // (index 2, shares "search" with the niche) is dropped by the semantic judge.
    const fetchImpl = vi.fn().mockResolvedValue(completion('{"relevant":[1,3]}'));
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept, calls, unjudged } = await judgeRelevance(client, {
      ...NICHE, candidates: ["webflow seo", "people search", "geo content"],
    });
    expect([...kept].sort()).toEqual(["geo content", "webflow seo"]);
    expect(kept.has("people search")).toBe(false);
    expect(calls).toBe(1);
    expect(unjudged).toEqual([]);
  });

  it("batches candidates over 80 and unions kept across calls", async () => {
    // 130 candidates → 2 batches (80 + 50). First batch keeps its #1, second keeps its #1.
    const candidates = Array.from({ length: 130 }, (_, i) => `kw-${i}`);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(completion('{"relevant":[1]}'))   // batch 1 → "kw-0"
      .mockResolvedValueOnce(completion('{"relevant":[1]}'));  // batch 2 → "kw-80"
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept, calls, unjudged } = await judgeRelevance(client, { ...NICHE, candidates });
    expect(calls).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect([...kept].sort()).toEqual(["kw-0", "kw-80"]);
    expect(unjudged).toEqual([]);
  });

  it("ignores out-of-range and non-integer indices (conservative)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion('{"relevant":[0,2,99,1.5,"x"]}'));
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept } = await judgeRelevance(client, { ...NICHE, candidates: ["a", "b", "c"] });
    // Only 2 is a valid 1-based index → "b". 0, 99, 1.5, "x" are all discarded.
    expect([...kept]).toEqual(["b"]);
  });

  it("hands a batch back as 'unjudged' (no throw) when its response lacks the 'relevant' array", async () => {
    // Malformed-but-parseable answer: the caller decides (drop / token-gate),
    // rather than judgeRelevance nuking the whole run.
    const fetchImpl = vi.fn().mockResolvedValue(completion('{"kept":[1]}'));
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept, calls, unjudged } = await judgeRelevance(client, { ...NICHE, candidates: ["a", "b"] });
    expect(kept.size).toBe(0);
    expect(calls).toBe(1); // the call WAS billed (chat returned), so it must be counted
    expect(unjudged).toEqual(["a", "b"]);
  });

  it("isolates a mid-run batch failure: other batches keep their verdicts", async () => {
    const candidates = Array.from({ length: 130 }, (_, i) => `kw-${i}`);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(completion('{"relevant":[1]}'))   // batch 1 (kw-0..79) → keep kw-0
      .mockResolvedValueOnce(completion("not json at all"));   // batch 2 (kw-80..129) → fails
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept, calls, unjudged } = await judgeRelevance(client, { ...NICHE, candidates });
    expect([...kept]).toEqual(["kw-0"]);           // batch 1's verdict survives
    expect(calls).toBe(2);                          // both calls billed
    expect(unjudged).toEqual(candidates.slice(80)); // only batch 2's candidates handed back
  });

  it("treats an empty 'relevant' array as 'nothing relevant here' (not a failure)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completion('{"relevant":[]}'));
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept, calls, unjudged } = await judgeRelevance(client, { ...NICHE, candidates: ["a", "b"] });
    expect(kept.size).toBe(0);
    expect(calls).toBe(1);
    expect(unjudged).toEqual([]); // judged fine — just nothing kept
  });

  it("does no work and makes no call for an empty candidate list", async () => {
    const fetchImpl = vi.fn();
    const client = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk", model: "deepseek-v4-pro", fetchImpl });
    const { kept, calls, unjudged } = await judgeRelevance(client, { ...NICHE, candidates: [] });
    expect(kept.size).toBe(0);
    expect(calls).toBe(0);
    expect(unjudged).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
