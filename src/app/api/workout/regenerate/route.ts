import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { variantFor, alternateFor } from "@/lib/regen";

export const dynamic = "force-dynamic";

const MAX_REGENS = 3;

// POST /api/workout/regenerate — the athlete doesn't like today's workout.
//   { id, mode: "variant" | "alternate" }
// variant:   same sport/intensity/duration, different structure (seeded by
//            regenCount so each press gives a NEW session, up to 3 total).
// alternate: same training goal expressed in a different modality — aerobic
//            days swap run/bike/swim; quality/strength days become sport-
//            specific plyometrics or power work (mandatory-rule compliant).
// The workout is rewritten in place: duration and weekly intent preserved.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const workout = await prisma.workout.findFirst({ where: { id: b.id, userId: user.id, planned: true } });
    if (!workout) return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    if ((workout.regenCount || 0) >= MAX_REGENS) {
      return NextResponse.json({ error: "Regeneration limit reached (3) — this session has given all it has. Execute it or rest.", status: "limit" }, { status: 429 });
    }

    const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
    const seed = (workout.regenCount || 0) + 1; // 1, 2, 3 -> different structures each time
    const zone = workout.intensity || "z2";

    let next: { sport: string; type: string; intensity?: string; title: string; description: string };
    if (b.mode === "alternate") {
      next = alternateFor(workout.sport, workout.type, zone, workout.durationMin, profile?.goal || "");
    } else {
      const v = variantFor(workout.sport, workout.type, zone, workout.durationMin, seed);
      next = { sport: workout.sport, type: workout.type, intensity: workout.intensity || undefined, title: v.title, description: v.description };
    }

    const updated = await prisma.workout.update({
      where: { id: workout.id },
      data: {
        sport: next.sport as any,
        type: next.type,
        intensity: next.intensity ?? workout.intensity,
        title: next.title,
        notes: next.description,
        regenCount: { increment: 1 },
      },
    });

    return NextResponse.json({
      ok: true,
      workout: updated,
      regensLeft: MAX_REGENS - updated.regenCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
