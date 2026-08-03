import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { runSelftest } from "./logic";

export async function GET() {
  const denied = await requireSession(); if (denied) return denied;
  const { count, sample } = runSelftest();
  return NextResponse.json({ ok: true, count, sample });
}
