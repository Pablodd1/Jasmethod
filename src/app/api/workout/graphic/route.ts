import { effectivePrescription } from "@/lib/effective-prescription";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  renderWorkoutSvg,
  renderDayPng,
  verifyGraphicToken,
  type GraphicStep,
} from "@/lib/workout-graphic";

export const dynamic = "force-dynamic";

// GET /api/workout/graphic
//   ?sessionId=<id>&format=svg|png   — owner-only (session cookie)
//   ?sessionId=<id>&token=<signed>   — public, expiring HMAC token (calendar,
//                                      Telegram fetch, email proxies)
//   ?demo=1                          — public sample (landing/marketing/tests)
//
// Returns the "red trail": one bar per step, red intensity by zone.

const DEMO_SESSIONS: GraphicStep[][] = [
  [
    { name: "Warm up", seconds: 540, zone: "z1", phase: "warmup" },
    { name: "Effort 1", seconds: 300, zone: "z4", phase: "active" },
    { name: "Easy recovery", seconds: 90, zone: "z1", phase: "recovery" },
    { name: "Effort 2", seconds: 300, zone: "z5", phase: "active" },
    { name: "Easy recovery", seconds: 90, zone: "z1", phase: "recovery" },
    { name: "Effort 3", seconds: 300, zone: "z5", phase: "active" },
    { name: "Tempo finish", seconds: 600, zone: "z4", phase: "active" },
    { name: "Cool down", seconds: 480, zone: "z1", phase: "cooldown" },
  ],
  [
    { name: "Warm-up — rope + shadow", seconds: 480, zone: "z1", phase: "warmup" },
    { name: "Round 1 — jab + cross", seconds: 180, zone: "z5", phase: "active" },
    { name: "Rest", seconds: 60, zone: "z1", phase: "recovery" },
    { name: "Round 2 — hooks", seconds: 180, zone: "z5", phase: "active" },
    { name: "Rest", seconds: 60, zone: "z1", phase: "recovery" },
    { name: "Round 3 — footwork", seconds: 180, zone: "z5", phase: "active" },
    { name: "Cool-down", seconds: 360, zone: "z1", phase: "cooldown" },
  ],
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const sessionId = url.searchParams.get("sessionId");
  const token = url.searchParams.get("token");

  let stepsRows: GraphicStep[][];

  if (url.searchParams.get("demo")) {
    stepsRows = DEMO_SESSIONS;
  } else if (sessionId) {
    if (!token) {
      // Cookie path: the session user must OWN the workout — a signed-in
      // athlete must not read another athlete's session shape.
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const owned = await prisma.workout.findFirst({
        where: { id: sessionId, userId: user.id },
        select: { id: true },
      });
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    } else if (!verifyGraphicToken(sessionId, token)) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
    }
    const w = await prisma.workout.findUnique({ where: { id: sessionId } });
    if (!w) return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    try {
      const resolved = await effectivePrescription(w.userId, w.id);
      if (!resolved || resolved.canonical.verdict !== "ready") return NextResponse.json({ error: "No current executable shape. Review the session and check-in in the app." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
      if (resolved.canonical.exactTimeSeconds == null) return NextResponse.json({ error: "This session uses distance, repetitions or lap endpoints. Estimated time cannot be presented as an exact timed shape." }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
      stepsRows = [resolved.canonical.steps.map(step => ({ name: step.name, seconds: step.seconds, zone: step.zone, phase: step.phase }))];
    } catch {
      return NextResponse.json({ error: "Session shape is unavailable. Review the plan in the app." }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
    }
  } else {
    return NextResponse.json({ error: "sessionId or demo required" }, { status: 400 });
  }

  if (format === "svg") {
    const svg = renderWorkoutSvg(stepsRows[0] || []);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": sessionId ? "private, no-store" : "public, max-age=86400",
      },
    });
  }
  const png = renderDayPng(stepsRows);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": sessionId ? "private, no-store" : "public, max-age=86400",
    },
  });
}
