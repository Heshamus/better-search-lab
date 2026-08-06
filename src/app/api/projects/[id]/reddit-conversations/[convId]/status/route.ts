import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { updateConversationStatus } from "@/lib/reddit/conversations-store";

const VALID_STATUSES = ["new", "dismissed", "posted"];

// Veto/act-on-it triage for one surfaced conversation.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; convId: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id, convId } = await params;
  const body = await req.json();

  if (!VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  await updateConversationStatus(db, id, convId, body.status);
  return NextResponse.json({ ok: true });
}
