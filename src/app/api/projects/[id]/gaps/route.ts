import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { listGapSignals } from "@/lib/competitors";

// Guarded read of this project's keyword-gap signals (Task 8). The
// Competitors page itself reads `listGapSignals` directly (server
// component, no /api round trip needed) — this route exists for any future
// client-side refresh-in-place that needs the same data without a full
// page reload.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  return NextResponse.json(await listGapSignals(db, id));
}
