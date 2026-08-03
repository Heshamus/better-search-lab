import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { runJob } from "@/lib/jobs/runner";
import { weeklyOpportunitiesHandler } from "@/lib/jobs/handlers/weekly-opportunities";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const date = `${new Date().toISOString().slice(0, 10)}-manual-${Date.now()}`;
  const result = await runJob(db, { type: "weekly_opportunities", projectId: id, date, handler: weeklyOpportunitiesHandler() });
  return NextResponse.json({ result });
}
