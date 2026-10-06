import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { planHyroxSplits, analyzeHyroxSplits, resolveHyroxPace } from "@/lib/hyrox";
export const dynamic = "force-dynamic";
function buildPlan(input: Record<string, unknown>, profile: { runPaceBase: number | null; sex: string | null } | null) {
  const resolved = resolveHyroxPace(input.pace, profile?.runPaceBase);
  const target = typeof input.target === "number" || typeof input.target === "string" ? Number(input.target) : NaN;
  const sex = input.sex ?? profile?.sex ?? "male";
  if (sex !== "female" && sex !== "male") throw new Error("Select a supported Singles division.");
  if (input.pro != null && ![true, false, "1", "0"].includes(input.pro as boolean | string)) throw new Error("Select Open or Pro.");
  const plan = planHyroxSplits({ targetTotalMin: target, runPaceSecPerKm: resolved.pace, sex, pro: input.pro === true || input.pro === "1" });
  if (resolved.source === "profile_threshold_scenario") plan.notes.push("Pace uses your saved running threshold as an unadjusted scenario anchor. It is not a validated HYROX race pace; enter your practiced compromised-running pace to revise it.");
  return { plan, paceSource: resolved.source };
}
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { runPaceBase: true, sex: true } });
  try {
    return NextResponse.json(buildPlan(Object.fromEntries(new URL(req.url).searchParams), profile));
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid planner input" }, { status: 400 }); }
}
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { runPaceBase: true, sex: true } });
  try {
    const b: unknown = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Invalid planner input");
    const input = b as Record<string, unknown>;
    const result = buildPlan(input, profile);
    if (!Array.isArray(input.actualSecs) || input.actualSecs.length !== 16) throw new Error("Provide 16 split entries; leave missing times blank.");
    const actualSecs = input.actualSecs.map((v: unknown) => {
      if (v === null || v === "") return null;
      if ((typeof v !== "number" && typeof v !== "string") || !String(v).trim()) throw new Error("Split times must be positive numbers or blank.");
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) throw new Error("Split times must be positive numbers or blank.");
      return n;
    });
    return NextResponse.json({ ...result, analysis: analyzeHyroxSplits(result.plan, actualSecs) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid planner input" }, { status: 400 }); }
}
