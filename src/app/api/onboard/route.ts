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


// GET /api/onboard — should the onboarding wizard show for this athlete?
// Only when they've never completed it OR their profile is missing the
// essentials. Returning users with a real profile never see the wizard again.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
    select: { goal: true, birthYear: true, weightKg: true },
  });
  // "Profile info given": at least one identity/baseline field beyond the
  // schema defaults (everything else has defaults, so only these prove the
  // athlete actually filled the wizard).
  const profileComplete = Boolean(
    profile && (profile.goal || profile.birthYear || profile.weightKg),
  );
  return NextResponse.json({ onboarded: user.onboarded, profileComplete });
}
