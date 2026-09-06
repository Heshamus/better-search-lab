import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { getConfig } from "@/lib/config/resolve";
import { makeDataForSeoClient, NOT_CONFIGURED } from "@/lib/config/clients";
import { keywordOverviewBulk } from "@/lib/dataforseo/labs";
import { parseKeywordList } from "@/lib/keyword-list";
import { logApiUsage } from "@/lib/dataforseo/cost";

const KO_ENDPOINT = "/v3/dataforseo_labs/google/keyword_overview/live";

// Project-agnostic bulk keyword lookup. Ephemeral: the ONLY write is the
// account-level cost log (no projectId). A thrown DataForSEO call returns 502
// and writes nothing — the client renders an honest error, never fake rows.
export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const { keywords, locationCode, languageCode } = await req.json().catch(() => ({}));
  const raw = Array.isArray(keywords) ? keywords.join("\n") : String(keywords ?? "");
  const { keywords: parsed, dropped } = parseKeywordList(raw);
  if (parsed.length === 0) return NextResponse.json({ error: "no keywords" }, { status: 400 });

  const client = makeDataForSeoClient(await getConfig(db));
  if (!client) return NextResponse.json({ error: NOT_CONFIGURED.dataforseo }, { status: 503 });
  try {
    const { rows, rowsBilled } = await keywordOverviewBulk(client, {
      keywords: parsed,
      locationCode: Number(locationCode),
      languageCode: String(languageCode || "en"),
    });
    // The DataForSEO call above already billed the account — a failure to record
    // that spend must never discard the (paid-for) rows the caller is owed. Log
    // and continue rather than letting a ledger-write throw 502 the request.
    try {
      await logApiUsage(db, { endpoint: KO_ENDPOINT, rows: rowsBilled }); // no projectId → account-level
    } catch (e) {
      console.error("[keyword-overview] cost log failed (continuing)", e);
    }
    return NextResponse.json({ rows, requested: parsed.length, dropped });
  } catch (e) {
    console.error("[keyword-overview] fetch failed", e);
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
