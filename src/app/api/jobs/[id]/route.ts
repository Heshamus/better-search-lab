import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";

// Job status for the UI's poll loop. Returns the current status + (on failure)
// the real error string, so a failed action shows what actually went wrong
// instead of a generic "try again".
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const [job] = await db
    .select({ id: jobs.id, type: jobs.type, status: jobs.status, error: jobs.error, finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(eq(jobs.id, id));
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json(job);
}
