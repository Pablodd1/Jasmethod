import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BLOOD_REFERENCE } from "@/lib/science";

// GET /api/blood — all panels with results + reference interpretation
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const panels = await prisma.bloodPanel.findMany({
    where: { userId: user.id },
    include: { results: true },
    orderBy: { date: "desc" },
  });
  // Annotate each result with reference range + status
  const annotated = panels.map((p) => ({
    ...p,
    results: p.results.map((r) => {
      const ref = BLOOD_REFERENCE[r.marker];
      const refLow = r.refLow ?? ref?.refLow;
      const refHigh = r.refHigh ?? ref?.refHigh;
      let status = "ok";
      if (refLow !== undefined && r.value < refLow) status = "low";
      else if (refHigh !== undefined && r.value > refHigh) status = "high";
      return { ...r, refLow, refHigh, status, athleteNote: ref?.athleteNote };
    }),
  }));
  return NextResponse.json({ panels: annotated, reference: BLOOD_REFERENCE });
}

// POST /api/blood — create panel with results
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { date, lab, note, results } = body || {};
    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: "At least one blood result required." }, { status: 400 });
    }
    const panel = await prisma.bloodPanel.create({
      data: {
        userId: user.id,
        date: new Date(date || new Date()),
        lab: lab || null,
        note: note || null,
        results: {
          create: results.map((r: any) => ({
            marker: r.marker,
            value: parseFloat(r.value),
            unit: r.unit || null,
            refLow: r.refLow !== undefined ? parseFloat(r.refLow) : null,
            refHigh: r.refHigh !== undefined ? parseFloat(r.refHigh) : null,
            notes: r.notes || null,
          })),
        },
      },
      include: { results: true },
    });
    return NextResponse.json({ ok: true, panel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
