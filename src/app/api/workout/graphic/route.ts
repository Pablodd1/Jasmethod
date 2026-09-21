import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  renderWorkoutSvg,
  renderDayPng,
  stepsForGraphic,
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
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else if (!verifyGraphicToken(sessionId, token)) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
    }
    const w = await prisma.workout.findUnique({ where: { id: sessionId } });
    if (!w) return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    stepsRows = [stepsForGraphic(w)];
  } else {
    return NextResponse.json({ error: "sessionId or demo required" }, { status: 400 });
  }

  if (format === "svg") {
    const svg = renderWorkoutSvg(stepsRows[0] || []);
    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": sessionId && !token ? "private, max-age=600" : "public, max-age=86400",
      },
    });
  }
  const png = renderDayPng(stepsRows);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": sessionId && !token ? "private, max-age=600" : "public, max-age=86400",
    },
  });
}
