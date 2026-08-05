import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// Run an AI-visibility scan (async). Enqueue + return; UI polls the job.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "ai_visibility_scan", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
