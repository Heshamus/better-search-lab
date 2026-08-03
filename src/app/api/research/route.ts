import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { keywordIdeas } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { loadEnv } from "@/config/env";
import { saveResearchSearch } from "@/lib/research-history";

export async function POST(req: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const { keywords, locationCode, languageCode, projectId } = await req.json();
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const { items, rows } = await keywordIdeas(client, { keywords, locationCode, languageCode });
  await logApiUsage(db, { endpoint: "/v3/dataforseo_labs/google/keyword_ideas/live", rows });
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
