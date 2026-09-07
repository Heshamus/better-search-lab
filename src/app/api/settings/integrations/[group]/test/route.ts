import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/api-guard";
import { getConfig } from "@/lib/config/resolve";
import { GROUPS, type SettingGroupId } from "@/lib/config/registry";
import { testIntegration } from "@/lib/config/tests";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ group: string }> }) {
  const admin = await requireAdmin(); if (admin instanceof Response) return admin;
  const { group } = await params;
  // Hidden groups (e.g. `setup`) are not integrations — no Test button is
  // ever rendered for them, and the route must 404 the same as any other
  // unknown group rather than reach testIntegration.
  if (!GROUPS.some((g) => g.id === group && !g.hidden)) return NextResponse.json({ error: "unknown integration" }, { status: 404 });
  const cfg = await getConfig(db, { fresh: true }); // test what was just saved, not a cached view
  return NextResponse.json(await testIntegration(group as SettingGroupId, cfg, { recipient: admin.email }));
}
