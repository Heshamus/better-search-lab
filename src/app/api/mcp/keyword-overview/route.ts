import { DataForSeoClient } from "@/lib/dataforseo/client";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";
import { parseKeywordList } from "@/lib/keyword-list";
import { MARKETS, DEFAULT_MARKET } from "@/lib/markets";
import { loadEnv } from "@/config/env";
import { mcpRoute, MissingParamError } from "@/lib/mcp/reader";
import { db } from "@/db/client";
import { logApiUsage } from "@/lib/dataforseo/cost";

const KO_ENDPOINT = "/v3/dataforseo_labs/google/keyword_overview/live";

// Project-agnostic (mirrors POST /api/keyword-overview — no projectId). Accepts
// `keywords` either comma-separated (`?keywords=a,b`) or repeated
// (`?keywords=a&keywords=b`): joining every occurrence with "\n" before handing
// off to the existing parseKeywordList lets ONE battle-tested parser (trim,
// lowercase, dedupe, ≤100 cap) handle both forms — it already splits on both
// "\n" and ",". `market` is matched by label exactly like the Keyword Overview
// UI (MARKETS.find(...) ?? DEFAULT_MARKET), so the same string the <select>
// shows works here.
function parseKeywords(searchParams: URLSearchParams): string[] {
  const raw = searchParams.getAll("keywords").join("\n");
  return parseKeywordList(raw).keywords;
}

export const GET = mcpRoute(async (req) => {
  const { searchParams } = new URL(req.url);
  const keywords = parseKeywords(searchParams);
  if (keywords.length === 0) throw new MissingParamError("keywords required");

  const marketLabel = searchParams.get("market");
  const market = MARKETS.find((m) => m.label === marketLabel) ?? DEFAULT_MARKET;

  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const result = await keywordOverviewBulk(client, {
    keywords,
    locationCode: market.locationCode,
    languageCode: market.languageCode,
  });
  // The DataForSEO call above already billed the account — mirror the POST
  // route's log-and-continue: a ledger-write failure must never cost the
  // caller the (paid-for) rows it's owed.
  try {
    await logApiUsage(db, { endpoint: KO_ENDPOINT, rows: result.rowsBilled }); // no projectId → account-level
  } catch (e) {
    console.error("[mcp/keyword-overview] cost log failed (continuing)", e);
  }
  return result;
});
