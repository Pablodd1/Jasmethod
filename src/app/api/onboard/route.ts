import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/onboard — mark the athlete's first-time setup as complete.
// Called by the onboarding wizard after profile + devices + races are set.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        onboarded: true,
        ...(body.language ? { language: body.language } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}


// GET /api/onboard — check if the athlete has completed onboarding
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ onboarded: user.onboarded });
}
