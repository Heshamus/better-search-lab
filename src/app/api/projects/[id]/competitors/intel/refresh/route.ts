import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { runJob } from "@/lib/jobs/runner";
import { competitorIntelHandler } from "@/lib/jobs/handlers/competitor-intel";
import { DataForSeoClient } from "@/lib/dataforseo/client";
import { loadEnv } from "@/config/env";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const env = loadEnv();
  const client = new DataForSeoClient({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
  const date = `${new Date().toISOString().slice(0, 10)}-manual-${Date.now()}`;
  const result = await runJob(db, { type: "competitor_intel", projectId: id, date, handler: competitorIntelHandler(client) });
  return NextResponse.json({ result }, { status: result === "failed" ? 502 : 200 });
}
