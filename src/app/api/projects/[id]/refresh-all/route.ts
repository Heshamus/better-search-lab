import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { enqueueJob } from "@/lib/jobs/queue";

// The "Refresh data" button: one async job that runs rankings → gaps →
// opportunities in order (opportunities reads the fresh gaps). Enqueue + return;
// the UI polls the single job, so the whole refresh shows one progress state.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const jobId = await enqueueJob(db, { type: "refresh_all", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
