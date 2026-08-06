import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// Run a Reddit conversations scan (async). Enqueue + return; UI polls the job.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "reddit_conversations_scan", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
