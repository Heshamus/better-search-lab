import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { updateProjectSettings } from "@/lib/projects";

const VALID_CADENCES = ["daily", "weekly"];

/**
 * Settings-screen mutation: saves a project's opportunity-scoring weights
 * and/or refresh cadence. Only the fields present in the body are updated —
 * an omitted field is left as-is. `refreshCadence` is the one enum worth a
 * 400 (single-tenant tool; weights are just coerced, not range-checked).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();

  if (body.refreshCadence !== undefined && !VALID_CADENCES.includes(body.refreshCadence)) {
    return NextResponse.json({ error: "invalid refreshCadence" }, { status: 400 });
  }

  const updates: { opportunityWeights?: Record<string, number>; refreshCadence?: string } = {};
  if (body.opportunityWeights !== undefined) {
    updates.opportunityWeights = Object.fromEntries(
      Object.entries(body.opportunityWeights).map(([key, value]) => [key, Number(value)]),
    );
  }
  if (body.refreshCadence !== undefined) updates.refreshCadence = body.refreshCadence;

  await updateProjectSettings(db, id, updates);
  return NextResponse.json({ ok: true });
}
