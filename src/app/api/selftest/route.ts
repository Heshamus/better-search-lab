import { NextResponse } from "next/server";
import { runSelftest } from "./logic";

export function GET() {
  return NextResponse.json(runSelftest());
}
