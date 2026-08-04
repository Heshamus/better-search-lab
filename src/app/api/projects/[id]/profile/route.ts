import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// Enqueue an async profile job and return immediately (the worker drains it, the
// UI polls /api/jobs/[jobId]). Profiling crawls + calls DataForSEO + DeepSeek and
// takes minutes — running it inline timed out at the auth proxy. See queue.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "profile_site", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
