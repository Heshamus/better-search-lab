import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { db } from "@/db/client";
import { setKeywordTracked } from "@/lib/keywords";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(); if (denied) return denied;
  const { id } = await params;
  const { tracked } = await req.json();
  await setKeywordTracked(db, id, tracked);
  return NextResponse.json({ ok: true });
}
