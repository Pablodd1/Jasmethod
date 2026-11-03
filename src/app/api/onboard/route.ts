import { assessPlanningSetup } from "@/lib/planning-setup";
import { readPlanningSetup } from "@/lib/planning-setup-store";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { autoGenerateStarterPlan } from "@/lib/plan-auto";
import { ensureStarterWorkout } from "@/lib/starter-session-store";
import { appMutationOriginAllowed } from "@/lib/request-origin";

// Completing the wizard records progress and ensures the first provisional week.
// Replacing an active cycle still needs a reviewed, confirmed preview.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!appMutationOriginAllowed(req)) return NextResponse.json({error:"Complete setup from this application."},{status:403});
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
      // Preserve the existing optional day-zero fallback when no sport has
      // been selected. A selected sport's saved week owns its sessions.
      if(plan.status==="choose_sport")await ensureStarterWorkout(user.id);
    } catch (e) {
      // Plan generation failure must not block onboarding completion.
      console.error("starter plan generation failed:", e);
    }
    return NextResponse.json({
      ok: true,
      plan,
      planPending: !plan,
      next: "/today",
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
