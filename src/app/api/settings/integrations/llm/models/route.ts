import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import { getConfig } from "@/lib/config/resolve";
import { listModels } from "@/lib/llm/models";

export async function GET() {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  return NextResponse.json({ models: await listModels(await getConfig(db, { fresh: true })) });
}
