import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { runJob } from "@/lib/jobs/runner";
import { profileSiteHandler } from "@/lib/jobs/handlers/profile-site";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { DeepSeekClient } from "@/lib/llm/deepseek";
import { loadEnv } from "@/config/env";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  // Optional: with a key, profiling extracts a tight niche and relevance-gates
  // expansion candidates; without one it degrades to heuristic seeds (no gate).
  const llm = env.DEEPSEEK_API_KEY ? new DeepSeekClient({ apiKey: env.DEEPSEEK_API_KEY }) : null;
  const date = `${new Date().toISOString().slice(0, 10)}-manual-${Date.now()}`;
  const result = await runJob(db, { type: "profile_site", projectId: id, date, handler: profileSiteHandler(client, { llm }) });
  return NextResponse.json({ result }, { status: result === "failed" ? 502 : 200 });
}
