import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { keywordIdeas } from "@/lib/dataforseo/labs";
import { logApiUsage } from "@/lib/dataforseo/cost";
import { loadEnv } from "@/config/env";

export async function POST(req: NextRequest) {
  const denied = await requireSession(); if (denied) return denied;
  const { keywords, locationCode, languageCode } = await req.json();
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const { items, rows } = await keywordIdeas(client, { keywords, locationCode, languageCode });
  await logApiUsage(db, { endpoint: "/v3/dataforseo_labs/google/keyword_ideas/live", rows });
  return NextResponse.json({ items });
}
