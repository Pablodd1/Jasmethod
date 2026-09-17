import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildZoneTable } from "@/lib/science";
import { parseTrainingCommand, applyTrainingCommand } from "@/lib/training-commands";
import { dayBounds } from "@/lib/dates";
import { protocolCoachContext } from "@/lib/protocols";
import { geminiAnswer, geminiGenerationConfig } from "@/lib/gemini-response";

export const dynamic = "force-dynamic";

// POST /api/assistant — JASAI Q&A. Any question: how to use the app, sports
// science, training, nutrition, tech. Grounded in THIS athlete's data (the
// same snapshot the daily briefing uses). Falls back to a helpful pointer if
// Gemini is unavailable.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { question } = await req.json();
    const q = String(question || "").trim().slice(0, 500);
    if (!q) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

    // Check if this is a training modification command
    const cmd = parseTrainingCommand(q);
    if (cmd.command !== "NO_CHANGE" && cmd.confidence >= 0.7) {
      // Fetch today's session and apply the command
      const todayS = new Date(); todayS.setHours(0, 0, 0, 0);
      const todayE = new Date(todayS); todayE.setDate(todayE.getDate() + 1);
      const todaySession = await prisma.workout.findFirst({
        where: { userId: user.id, date: { gte: todayS, lt: todayE }, planned: true },
        orderBy: { date: "asc" },
      });
      if (todaySession) {
        // Fetch readiness context for safety checks
        const lastCheckin = await prisma.dailyCheckin.findFirst({
          where: { userId: user.id },
          orderBy: { date: "desc" },
        });
        let readinessScore = 60, hrvStatus = "normal", soreness = 3;
        if (lastCheckin?.adaptation) {
          try {
            const a = JSON.parse(lastCheckin.adaptation);
            readinessScore = a.score ?? 60;
          } catch {}
        }
        const result = applyTrainingCommand(
          { session: { title: todaySession.title, mainSet: [todaySession.notes || todaySession.title], totalQualityMeters: 300, type: todaySession.type } },
          cmd,
          { readinessScore, hrvStatus, soreness },
        );
        if (result.allowed) {
          // Apply to the database
          await prisma.workout.update({
            where: { id: todaySession.id },
            data: {
              title: result.adjusted.session.title,
              notes: result.adjusted.session.mainSet.join("; "),
              durationMin: result.adjusted.session.durationMin ?? todaySession.durationMin,
            },
          });
        }
        return NextResponse.json({
          ok: true,
          answer: result.explanation,
          trainingModified: result.allowed,
          command: cmd.command,
        });
      }
    }

    const { start: today, end } = dayBounds(user.timezone);
    const [profile, todayWorkouts, lastCheckin, plan, race] = await Promise.all([
      prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
      prisma.workout.findMany({ where: { userId: user.id, date: { gte: today, lt: end }, planned: true }, orderBy: { date: "asc" } }),
      prisma.dailyCheckin.findFirst({ where: { userId: user.id, date: { gte: today, lt: end } }, orderBy: { date: "desc" } }),
      prisma.trainingPlan.findFirst({ where: { userId: user.id, status: "active" } }),
      prisma.race.findFirst({ where: { userId: user.id, date: { gte: today } }, orderBy: [{ priority: "asc" }, { date: "asc" }] }),
    ]);

    let readiness = "";
    if (lastCheckin?.adaptation) {
      try { const a = JSON.parse(lastCheckin.adaptation); readiness = `last check-in (${new Date(lastCheckin.date).toISOString().slice(0, 10)}): score ${a.score}/100, verdict ${a.verdict}`; } catch {}
    }
    const zones = buildZoneTable({
      maxHr: profile?.maxHr ?? undefined, lthr: profile?.lthr ?? undefined, ftp: profile?.ftp ?? undefined,
      thresholdPaceSecPerKm: profile?.runPaceBase ?? undefined, thresholdPaceSecPer100m: profile?.swimPaceBase ?? undefined,
    });

    const langNames: Record<string, string> = { en: "English", es: "Spanish", ht: "Haitian Creole", fr: "French", ru: "Russian" };
    const system = `You are JASAI, the assistant of the JasMiamiMethod training app. Answer the athlete's question.
You may be asked: how to use the app (Today page = today's session with full pre/during/post arc; Check In adapts the session; Calendar; AdvanzedRacing = race prediction with live weather; Labs = field tests; Connectors = devices via Strava bridge or file upload; Reminders = email/Telegram), sports science (training zones, recovery, sleep, nutrition, supplements), or anything about their data below.
Athlete: ${user.name}. Goal: ${profile?.goal || "unknown"}. Experience: ${profile?.experience || "unknown"}. FTP ${profile?.ftp ?? "?"}W, LTHR ${profile?.lthr ?? "?"}bpm, run threshold ${profile?.runPaceBase ?? "?"}s/km, swim ${profile?.swimPaceBase ?? "?"}s/100m.
Active plan: ${plan?.name || "none"}. Today's session: ${todayWorkouts[0] ? `${todayWorkouts[0].title} ${todayWorkouts[0].durationMin}min ${todayWorkouts[0].intensity || ""}` : "none"}. Readiness ${readiness || "no check-ins yet"}. Next race: ${race ? `${race.name} ${new Date(race.date).toISOString().slice(0, 10)}` : "none"}.
Rules: use the athlete's real numbers when relevant; be concise (max 120 words); science-backed, no medical diagnosis (suggest a physician for injury/illness); reply entirely in ${langNames[user.language] || "Spanish"}; plain language, no markdown.`;
    const grounding = `${protocolCoachContext(todayWorkouts)}\nInjury flag: ${profile?.injured ? "active: pause training" : "not recorded"}. Missing check-ins mean recovery is unknown.`;

    const key = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    let answer: string;
    if (key) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n${grounding}\n\nQuestion: ${q}` }] }],
          generationConfig: geminiGenerationConfig(model),
        }),
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        answer = geminiAnswer(data);
        if (!answer) console.warn("[assistant] No complete Gemini answer", data?.candidates?.[0]?.finishReason || "empty");
      } else {
        answer = "";
      }
    } else {
      answer = "";
    }
    if (!answer) {
      answer = user.language === "es"
        ? "Ahora mismo no puedo consultar el modelo, pero tu sesión de hoy está en la página Hoy con todo el arco (pre-entreno, calentamiento, serie principal, respiración, post). Para dudas de entrenamiento revisa las Guías científicas; para dispositivos, Conectores."
        : "I can't reach the model right now, but today's session is on the Today page with the full arc (pre-fuel, warm-up, main set, breathing, post). For training questions see the Science Guides; for devices, Connectors.";
    }

    return NextResponse.json({ ok: true, answer });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
