import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// Async site-audit run. Enqueue + return; the worker crawls + scores, the UI
// polls /api/jobs/[jobId]. Free (own crawler).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "site_audit", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
