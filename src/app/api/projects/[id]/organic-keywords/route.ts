import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// Async organic-keywords refresh. Enqueue + return; worker fetches + snapshots, UI polls /api/jobs/[jobId].
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "organic_keywords_refresh", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
