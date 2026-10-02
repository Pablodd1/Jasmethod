import { assessPlanningSetup } from "@/lib/planning-setup";
import { readPlanningSetup } from "@/lib/planning-setup-store";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { autoGenerateStarterPlan } from "@/lib/plan-auto";

// Completing the wizard records progress; a plan needs complete setup and a confirmed preview.
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
    let plan: Awaited<ReturnType<typeof autoGenerateStarterPlan>> | null = null;
    try {
      plan = await autoGenerateStarterPlan(user.id);
    } catch (e) {
      // Plan generation failure must not block onboarding completion.
      console.error("starter plan generation failed:", e);
    }
    return NextResponse.json({
      ok: true,
      plan,
      next: "/training",
    });
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
  const [profile, setupState] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
    readPlanningSetup(user.id),
  ]);
  const readiness = assessPlanningSetup(profile, setupState.setup);
  return NextResponse.json({ onboarded: user.onboarded, profileComplete: readiness.ready, planningReadiness: readiness });
}
export const dynamic = "force-dynamic";
