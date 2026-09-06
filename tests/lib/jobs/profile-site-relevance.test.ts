import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@/db/test-db";
import { createProject } from "@/lib/projects";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { OpenAICompatibleProvider } from "@/lib/llm/openai-compatible";
import { profileSiteHandler } from "@/lib/jobs/handlers/profile-site";
import { runJob } from "@/lib/jobs/runner";
import { listProfileCandidates } from "@/lib/profile";
import { buildNicheProfile, relevanceScore, DEFAULT_RELEVANCE_THRESHOLD } from "@/lib/core/relevance";

let close: () => Promise<void>;
afterEach(() => close?.());

function ideaItems(items: { keyword: string; vol: number }[]) {
  return items.map((k) => ({
    keyword: k.keyword,
    keyword_info: { search_volume: k.vol },
    keyword_properties: { keyword_difficulty: 20 },
  }));
}

// The judge STUB models DeepSeek's SEMANTIC filter: keep only genuinely on-niche
// expansion keywords (webflow/geo), reading the numbered candidate list out of
// the judge prompt and returning the 1-based indices of the keepers. A real
// judge understands meaning; for wiring tests a substring keep-rule is enough.
function judgeIndices(prompt: string): number[] {
  const idx: number[] = [];
  for (const m of prompt.matchAll(/^(\d+)\.\s+(.+)$/gm)) {
    if (/(webflow|geo)/i.test(m[2])) idx.push(Number(m[1]));
  }
  return idx;
}

// One fetch routes DeepSeek (BOTH the niche-extract call AND the judge call),
// DataForSEO labs, and the crawl. ZERO live spend — fixtures only.
function fakeFetch(cfg: { nicheTerms: string[]; expansion: { keyword: string; vol: number }[]; breakJudge?: boolean }): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("api.deepseek.com")) {
      // Reconstruct the real prompt (JSON-serialized \n become real newlines) to
      // tell the two DeepSeek calls apart and to read the judge's candidate list.
      const reqBody = JSON.parse(String(init?.body ?? "{}"));
      const prompt = (reqBody.messages ?? []).map((m: { content: string }) => m.content).join("\n");
      if (prompt.includes("Candidate keywords")) {
        // breakJudge: every judge batch returns unparseable content → the judge is
        // "entirely unavailable" and the handler must fall back to the token gate.
        const content = cfg.breakJudge ? "the model refused to answer" : JSON.stringify({ relevant: judgeIndices(prompt) });
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
      }
      const content = JSON.stringify({
        seeds: ["webflow seo automation", "geo optimization for agencies", "programmatic seo"],
        nicheTerms: cfg.nicheTerms,
      });
      return new Response(JSON.stringify({ choices: [{ message: { reasoning_content: "…", content } }] }), { status: 200 });
    }
    if (u.includes("api.dataforseo.com")) {
      const isRanked = u.includes("ranked_keywords");
      const items = isRanked
        ? [{ keyword_data: { keyword: "harperflow", keyword_info: { search_volume: 40 }, keyword_properties: { keyword_difficulty: 8 } },
             ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://harperflow.io/" } } }]
        : ideaItems(cfg.expansion);
      return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items }] }] }), { status: 200 });
    }
    return new Response(`<html><head><title>Webflow SEO Automation</title></head><body><h1>GEO optimization</h1></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

async function runProfile(fetchImpl: typeof fetch): Promise<string[]> {
  const t = await createTestDb(); close = t.close;
  const p = await createProject(t.db, { name: "HF", domain: "harperflow.io" });
  const client = new DataForSeoClient({ login: "x", password: "y", fetchImpl });
  const llm = new OpenAICompatibleProvider({ baseUrl: "https://api.deepseek.com", apiKey: "sk-test", model: "deepseek-v4-pro", fetchImpl });
  const status = await runJob(t.db, {
    type: "profile_site", projectId: p.id, date: "2026-08-04-relevance",
    handler: profileSiteHandler(client, { fetchImpl, llm }),
  });
  expect(status).toBe("done");
  const rows = await listProfileCandidates(t.db, p.id);
  return rows.map((r) => r.keyword);
}

describe("profileSiteHandler LLM relevance judge", () => {
  it("keeps on-niche expansion and drops generic high-volume terms via the judge", async () => {
    const expansion = [
      { keyword: "webflow seo", vol: 400 },
      ...Array.from({ length: 30 }, (_, i) => ({ keyword: `webflow seo strategy ${i}`, vol: 100 + i })),
      { keyword: "poly ai", vol: 1_000_000 },
      { keyword: "face swap ai", vol: 500_000 },
    ];
    const keywords = await runProfile(fakeFetch({ nicheTerms: ["seo", "webflow", "content", "geo", "automation"], expansion }));

    // On-niche keyword survives even though its volume is a rounding error next to
    // the generic terms — proof the result is relevance-gated, not volume-dominated.
    expect(keywords).toContain("webflow seo");
    expect(keywords).not.toContain("poly ai");
    expect(keywords).not.toContain("face swap ai");
  });

  it("drops token-bridge generics ('people search') that the token-overlap gate WOULD keep", async () => {
    // The niche legitimately contains the token "search" (from "ai search
    // optimization"), so token-overlap scores "people search" as relevant — the
    // exact failure mode the semantic judge exists to fix.
    const nicheTerms = ["ai search optimization", "webflow", "geo", "content automation"];
    const expansion = [
      { keyword: "webflow seo", vol: 300 },
      { keyword: "geo content strategy", vol: 200 },
      ...Array.from({ length: 25 }, (_, i) => ({ keyword: `webflow geo tactic ${i}`, vol: 50 + i })),
      { keyword: "google search", vol: 5_000_000 },
      { keyword: "people search", vol: 2_000_000 },
      { keyword: "pinterest search", vol: 1_000_000 },
    ];

    // PROVE the token-overlap gate would let "people search" through against this
    // niche (it shares the "search" token) — so excluding it below is the judge's doing.
    const profile = buildNicheProfile(
      [...nicheTerms, "webflow seo automation", "geo optimization for agencies", "programmatic seo"].map((k) => ({ keyword: k, tags: [] })),
    );
    expect(relevanceScore("people search", profile)).toBeGreaterThanOrEqual(DEFAULT_RELEVANCE_THRESHOLD);

    const keywords = await runProfile(fakeFetch({ nicheTerms, expansion }));

    expect(keywords).toContain("webflow seo");
    expect(keywords).toContain("geo content strategy");
    // ...yet the pipeline (semantic judge) excluded every high-volume "* search" bridge term.
    expect(keywords).not.toContain("google search");
    expect(keywords).not.toContain("people search");
    expect(keywords).not.toContain("pinterest search");
  });

  it("falls back to the token-overlap gate when the judge is entirely unavailable", async () => {
    // Every judge batch fails → the handler must NOT drop all expansion; it degrades
    // to the token-overlap gate, which still removes obvious off-niche junk.
    const expansion = [
      { keyword: "webflow seo", vol: 400 },
      ...Array.from({ length: 30 }, (_, i) => ({ keyword: `webflow seo strategy ${i}`, vol: 100 + i })),
      { keyword: "poly ai", vol: 1_000_000 },
    ];
    const keywords = await runProfile(fakeFetch({ nicheTerms: ["seo", "webflow", "content", "geo", "automation"], expansion, breakJudge: true }));

    // Token-overlap keeps on-niche terms (full overlap) and drops "poly ai"
    // ({poly} ∩ profile = ∅) — a sane degraded result, not an empty profile.
    expect(keywords).toContain("webflow seo");
    expect(keywords).not.toContain("poly ai");
  });
});
