import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { setOpportunityStatus } from "@/lib/opportunities";

const VALID_STATUSES = ["new", "tracked", "dismissed", "done"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  await setOpportunityStatus(db, id, status);
  return NextResponse.json({ ok: true });
}
