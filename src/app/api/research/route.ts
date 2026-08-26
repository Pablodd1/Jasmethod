import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { RESEARCH_SOURCES } from "@/lib/research";

// GET /api/research — the full evidence base behind the method
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ sources: RESEARCH_SOURCES });
}
