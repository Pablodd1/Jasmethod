import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildAthleteModel } from "@/lib/athlete-model";
import { derivedActivityPolicy } from "@/lib/derived-activity-policy";

// GET /api/athlete-model — the daily coach's individual model for the signed-in athlete:
// history coverage, level (stated or labelled estimate), age band, personal spacing,
// key-session cap, stale targets, and the onboarding questions still unanswered.
// Own data only; nothing here is sent to an external model.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const since = new Date(Date.now() - 90 * 86400000);
  const [profile, history, metrics] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
    prisma.workout.findMany({ where: { userId: user.id, date: { gte: since, lte: new Date() } }, orderBy: { date: "asc" } }),
    prisma.dailyMetrics.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { date: "asc" } }),
  ]);
  const activity = derivedActivityPolicy(history as any), biometric = derivedActivityPolicy(metrics as any);
  const model = buildAthleteModel({ history: activity.status === "allowed" ? history : [], metrics: biometric.status === "allowed" ? metrics : [], profile: profile as any });
  return NextResponse.json({ model, language: user.language, provenance: { activity: activity.status, biometric: biometric.status } });
}
