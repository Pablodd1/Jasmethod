import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { planHyroxSplits, analyzeHyroxSplits } from "@/lib/hyrox";

export const dynamic = "force-dynamic";

// GET /api/hyrox/split-planner?target=75&pace=270[&sex=female&pro=1]
// POST /api/hyrox/split-planner { target, pace, sex, pro, actualSecs: number[16] }
//   -> plan + weak-station analysis of the actual race splits.
function buildPlan(q: URLSearchParams) {
  const target = parseFloat(q.get("target") || "75");
  const profilePace = parseFloat(q.get("pace") || "0");
  const sex = (q.get("sex") as "male" | "female") || "male";
  const pro = q.get("pro") === "1";
  return planHyroxSplits({ targetTotalMin: target, runPaceSecPerKm: profilePace || 270, sex, pro });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);

  // Default pace: the athlete's run threshold * 1.08 (HYROX 1km race pace off
  // a threshold base), else 4:30/km.
  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
  const q = url.searchParams;
  if (!q.get("pace") && profile?.runPaceBase) q.set("pace", String(Math.round(profile.runPaceBase * 1.08)));
  if (!q.get("sex") && profile?.sex) q.set("sex", profile.sex);

  const plan = buildPlan(q);
  return NextResponse.json({ plan });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const plan = planHyroxSplits({
      targetTotalMin: parseFloat(b.target || "75"),
      runPaceSecPerKm: parseFloat(b.pace || "270"),
      sex: b.sex === "female" ? "female" : "male",
      pro: b.pro === true || b.pro === "1",
    });
    const actualSecs: number[] = Array.isArray(b.actualSecs) ? b.actualSecs.map((x: any) => Number(x) || 0) : [];
    const analysis = actualSecs.length === 16 ? analyzeHyroxSplits(plan, actualSecs) : null;
    return NextResponse.json({ plan, analysis });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
