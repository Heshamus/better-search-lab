import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { setGaProperty } from "@/lib/google/store";
import { enqueueJob } from "@/lib/jobs/queue";

// Save the user's chosen GA4 property for a project, then kick off the first sync.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { propertyId?: string };
  const propertyId = String(body.propertyId ?? "").trim();
  if (!/^\d+$/.test(propertyId)) return NextResponse.json({ error: "invalid propertyId" }, { status: 400 });

  await setGaProperty(db, id, propertyId);
  const jobId = await enqueueJob(db, { type: "ga_sync", projectId: id });
  return NextResponse.json({ jobId }, { status: 202 });
}
