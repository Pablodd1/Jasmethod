import { appMutationOriginAllowed } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { addDaysKey, dateKey, localDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!appMutationOriginAllowed(req)) {
    return NextResponse.json({ error: "Use the rest-day form on this website." }, { status: 403 });
  }
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ error: "A date and confirmation are required." }, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return NextResponse.json({ error: "Request too large." }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid rest-day request." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => key !== "date" && key !== "confirmed") || typeof input.date !== "string" || typeof input.confirmed !== "boolean") {
      return NextResponse.json({ error: "Provide only date and confirmed." }, { status: 400 });
    }
    let start: Date, end: Date;
    try {
      const today = dateKey(new Date(), user.timezone);
      start = localDate(input.date, user.timezone);
      end = localDate(addDaysKey(input.date, 1), user.timezone);
      if (input.date > today || input.date < addDaysKey(today, -89)) throw new Error("Date outside allowed range");
    } catch { return NextResponse.json({ error: "Choose a valid date within the last 90 local calendar days, including today." }, { status: 400 }); }
    const confirmed = input.confirmed;
    const saved = await prisma.$transaction(async tx => {
      // Serialize this user's confirmations so repeated submissions stay idempotent.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      if (confirmed) {
        const completed = await tx.workout.findFirst({
          where: { userId: user.id, date: { gte: start, lt: end }, OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }] },
          select: { id: true },
        });
        if (completed) return false;
      }
      await tx.metricObservation.deleteMany({ where: { userId: user.id, metricType: "jmm_rest_day", observedAt: { gte: start, lt: end } } });
      if (confirmed) await tx.metricObservation.create({ data: {
        userId: user.id, observedAt: start, metricType: "jmm_rest_day", value: 1,
        unit: "day", source: "manual", measurementMethod: "athlete_reported_rest", qualityFlag: "ok",
      } });
      await tx.appEvent.create({ data: { userId: user.id, kind: "info", source: "server", route: "/api/j-metrics/rest-day", message: "Rest-day declaration updated" } });
      return true;
    });
    if (!saved) return NextResponse.json({ error: "This day contains completed training. Correct the training record before confirming rest." }, { status: 409 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to save the rest-day declaration. Try again." }, { status: 500 });
  }
}
