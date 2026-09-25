import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { scheduleTests } from "@/lib/adaptive";

// GET /api/benchmarks — scheduled + completed tests
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tests = await prisma.benchmarkTest.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
  return NextResponse.json({ tests });
}

// POST /api/benchmarks/schedule — (re)generate the test calendar from the active plan + races
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const plan = await prisma.trainingPlan.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    if (!plan) return NextResponse.json({ error: "No active plan — generate one first." }, { status: 400 });
    const races = await prisma.race.findMany({ where: { userId: user.id, date: { gte: plan.startDate } } });
    const scheduled = scheduleTests(plan.startDate, plan.weeks, races.map((r) => ({ date: r.date })));

    // replace existing scheduled (not completed) tests for this plan
    await prisma.benchmarkTest.deleteMany({ where: { userId: user.id, completed: false } });
    const created = await prisma.benchmarkTest.createMany({
      data: scheduled.map((t) => ({
        userId: user.id,
        date: t.date,
        type: t.type,
        name: t.name,
        skipped: t.skipped,
        reason: t.reason || null,
        completed: false,
      })),
    });
    return NextResponse.json({ ok: true, count: created.count, tests: scheduled });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// PUT /api/benchmarks — mark a test complete with a result (updates physiology anchors)
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const t = await prisma.benchmarkTest.findFirst({ where: { id: b.id, userId: user.id } });
    if (!t) return NextResponse.json({ error: "Test not found" }, { status: 404 });
    const result = b.result !== undefined ? parseFloat(b.result) : undefined;
    const updated = await prisma.benchmarkTest.update({
      where: { id: t.id },
      data: { completed: true, result, skipped: false },
    });

    // Update the relevant physiology anchor so training re-anchors immediately
    if (result !== undefined && result > 0) {
      const p = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
      const patch: Record<string, number> = {};
      if (t.type === "ftp" || t.type === "cp") patch.ftp = Math.round(result);
      if (t.type === "lthr") patch.lthr = Math.round(result);
      // Run threshold from a 5k TT: threshold pace ≈ 5k pace × ~1.06
      // (Daniels-style: threshold ≈ ~94% of vVO2 ≈ 15-min effort pace).
      if (t.type === "run5k") {
        // result is 5k time in seconds → sec/km, then × 1.06 → threshold sec/km
        const secPerKm = result / 5;
        patch.runPaceBase = Math.round(secPerKm * 1.06);
      }
      // Swim threshold from the CSS test (result in sec/100m IS the CSS)
      if (t.type === "swim") patch.swimPaceBase = Math.round(result);
      if (p && Object.keys(patch).length)
        await prisma.athleteProfile.update({ where: { userId: user.id }, data: patch });
    }
    return NextResponse.json({ ok: true, test: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
