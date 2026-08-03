import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { addCompetitor, removeCompetitor, updateCompetitorDomain, CompetitorCapError } from "@/lib/competitors";

/**
 * Adds a tracked competitor domain to a project. `addCompetitor` dedupes
 * (re-adding an already-tracked domain is a no-op 200) and enforces the
 * max-5 cap — a genuinely new domain at the cap throws CompetitorCapError,
 * which this route maps to 409 (not 400/500) so the competitor-manager UI
 * can distinguish "at capacity" from a validation or server error.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const { domain } = await req.json();
  if (!domain || typeof domain !== "string") return NextResponse.json({ error: "domain required" }, { status: 400 });
  try {
    const competitor = await addCompetitor(db, id, domain);
    return NextResponse.json({ competitor });
  } catch (e) {
    if (e instanceof CompetitorCapError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}

/**
 * Removes a tracked competitor. `removeCompetitor` is project-scoped (the
 * delete is `WHERE projectId = :id AND id = :competitorId`), so a
 * cross-project competitorId is a silent no-op rather than an error.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const { competitorId } = await req.json();
  await removeCompetitor(db, id, competitorId);
  return NextResponse.json({ ok: true });
}

/**
 * Edits a competitor's domain in place (normalized by `updateCompetitorDomain`)
 * rather than remove+re-add, preserving its createdAt/position in the list.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  await params;
  const { competitorId, domain } = await req.json();
  if (!domain || typeof domain !== "string") return NextResponse.json({ error: "domain required" }, { status: 400 });
  await updateCompetitorDomain(db, competitorId, domain);
  return NextResponse.json({ ok: true });
}
