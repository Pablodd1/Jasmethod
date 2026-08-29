import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// POST /api/cognitive — save a cognitive test result (stroop | reaction | memory)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const { test, score, accuracy, notes } = b || {};
    if (!test || score === undefined) return NextResponse.json({ error: "test + score required" }, { status: 400 });
    const saved = await prisma.cognitiveTest.create({
      data: { userId: user.id, test: String(test), score: parseFloat(score), accuracy: accuracy != null ? parseFloat(accuracy) : null, notes: notes ? String(notes) : null },
    });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/cognitive — recent results + averages per test
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tests = await prisma.cognitiveTest.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 50,
  });
  const byType: Record<string, { scores: number[]; accuracy: number[] }> = {};
  for (const t of tests) {
    if (!byType[t.test]) byType[t.test] = { scores: [], accuracy: [] };
    byType[t.test].scores.push(t.score);
    if (t.accuracy != null) byType[t.test].accuracy.push(t.accuracy);
  }
  const best: Record<string, { best: number; avg: number; n: number }> = {};
  for (const [k, v] of Object.entries(byType)) {
    // lower = better for stroop/reaction (ms); higher = better for tapping/
    // balance (count/seconds), memory (correct), pulse (no trend — skip best)
    if (k === "pulse") continue; // resting HR: no "best", track trend only
    const lowerBetter = k === "stroop" || k === "reaction";
    best[k] = {
      best: lowerBetter ? Math.min(...v.scores) : Math.max(...v.scores),
      avg: Math.round(v.scores.reduce((a, s) => a + s, 0) / v.scores.length),
      n: v.scores.length,
    };
  }
  return NextResponse.json({ tests: tests.slice(0, 20), best });
}
