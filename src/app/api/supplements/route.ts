import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  SPORT_PROTOCOLS,
  SPORT_KEY_FOR_DISCIPLINE,
  SUPPLEMENT_DB,
} from "@/lib/supplement-db";

// GET /api/supplements            → full graded database (id/name/dose/summary)
// GET /api/supplements?mine=1     → prioritized protocol for the athlete's goal
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine");

  if (!mine) {
    return NextResponse.json({
      ok: true,
      supplements: SUPPLEMENT_DB.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        tier: s.tier,
        evidenceScore: s.evidenceScore,
        dose: s.dose,
        timing: s.timing,
        caution: s.caution ?? null,
      })),
    });
  }

  const discipline = user.profile?.goal || "";
  const protocolKey = SPORT_KEY_FOR_DISCIPLINE[discipline];
  const protocol = protocolKey ? SPORT_PROTOCOLS[protocolKey] : undefined;

  if (!protocol) {
    return NextResponse.json({
      ok: true,
      discipline: discipline || null,
      protocol: [],
      note: "No sport-specific protocol yet — the general graded database applies.",
    });
  }

  const detailed = protocol
    .map((p) => {
      const s = SUPPLEMENT_DB.find((x) => x.id === p.id);
      return s
        ? {
            priority: p.priority,
            reason: p.reason,
            id: s.id,
            name: s.name,
            category: s.category,
            tier: s.tier,
            evidenceScore: s.evidenceScore,
            dose: s.dose,
            timing: s.timing,
            mechanism: s.mechanism,
            caution: s.caution ?? null,
            citations: s.citations,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.priority - b!.priority);

  return NextResponse.json({ ok: true, discipline, protocol: detailed });
}
