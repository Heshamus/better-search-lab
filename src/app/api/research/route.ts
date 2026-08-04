import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { keywordSuggestions } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { loadEnv } from "@/config/env";
import { saveResearchSearch } from "@/lib/research-history";

export async function POST(req: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const { keywords, locationCode, languageCode, projectId } = await req.json();
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  // Phrase-match on the seed (keywords is the UI's one-seed array) so results are
  // ACTUALLY about the seed, not the broad word-overlap universe keyword_ideas returns.
  const seed = Array.isArray(keywords) ? keywords[0] : keywords;
  const { items, rows } = await keywordSuggestions(client, { keyword: seed, locationCode, languageCode });
  await logApiUsage(db, { endpoint: "/v3/dataforseo_labs/google/keyword_suggestions/live", rows });
  // Task 16: persist to research history (Recents, Task 18) on the success
  // path only — a thrown/rejected keywordIdeas() call above skips this
  // entirely, so a failed fetch never fabricates a saved search. projectId
  // is guarded rather than required so a caller that omits it (there's no
  // request-body validation on this route) still gets its keyword ideas
  // back instead of a 500 from the NOT NULL/FK on research_searches.
  if (projectId) {
    await saveResearchSearch(db, projectId, keywords.join(", "), items);
  }
  return NextResponse.json({ items });
}
