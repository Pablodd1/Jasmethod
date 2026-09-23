import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildZoneTable } from "@/lib/science";
import { parseTrainingCommand, applyTrainingCommand } from "@/lib/training-commands";
import { dayBounds } from "@/lib/dates";
import { protocolCoachContext } from "@/lib/protocols";
import { geminiAnswer, geminiGenerationConfig } from "@/lib/gemini-response";
import { meterUsage, logEvent } from "@/lib/telemetry";

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
      // Fetch today's session — in the ATHLETE's timezone, not the server's.
      const { start: cmdDay, end: cmdDayEnd } = dayBounds(user.timezone);
      const todaySession = await prisma.workout.findFirst({
        where: { userId: user.id, date: { gte: cmdDay, lt: cmdDayEnd }, planned: true },
        orderBy: { date: "asc" },
      });
      if (todaySession) {
        // Readiness context: TODAY's check-in only — a week-old check-in is
        // not "current readiness", and unknown data must stay unknown so the
        // safety gates in applyTrainingCommand behave conservatively.
        const todayCheckin = await prisma.dailyCheckin.findFirst({
          where: { userId: user.id, date: { gte: cmdDay, lt: cmdDayEnd } },
          orderBy: { date: "desc" },
        });
        let readinessScore: number | undefined;
        let soreness: number | undefined;
        let hrvStatus: string | undefined;
        if (todayCheckin?.adaptation) {
          try {
            const a = JSON.parse(todayCheckin.adaptation);
            readinessScore = a.score;
          } catch {}
        }
        if (todayCheckin?.answers) {
          try {
            const ans = JSON.parse(todayCheckin.answers);
            soreness = ans.soreness;
          } catch {}
        }
        const [metrics, profileRow] = await Promise.all([
          prisma.dailyMetrics.findUnique({
            where: { userId_date: { userId: user.id, date: cmdDay } },
          }),
          prisma.athleteProfile.findUnique({
            where: { userId: user.id },
            select: { hrvBaseline: true },
          }),
        ]);
        if (metrics?.hrv != null && profileRow?.hrvBaseline != null) {
          const delta = (metrics.hrv - profileRow.hrvBaseline) / profileRow.hrvBaseline;
          hrvStatus = delta >= 0.05 ? "high" : delta <= -0.1 ? "low" : "normal";
        }
        const result = applyTrainingCommand(
          { session: { title: todaySession.title, mainSet: [todaySession.notes || todaySession.title], totalQualityMeters: 300, type: todaySession.type, durationMin: todaySession.durationMin } },
          cmd,
          { readinessScore, hrvStatus, soreness },
        );
        if (result.allowed) {
          const before = {
            title: todaySession.title,
            durationMin: todaySession.durationMin,
            notes: todaySession.notes,
          };
          // Apply to the database. CRITICAL: originalPlan is the seed Today
          // regenerates from when the stored prescription is missing — leaving
          // it stale resurrected a hard session after a rest-day edit. Every
          // accepted chat edit rewrites originalPlan to match; a rest day also
          // persists a complete rest prescription so no surface can rebuild
          // the hard steps.
          const newTitle = result.adjusted.session.title;
          const newDuration = result.adjusted.session.durationMin ?? todaySession.durationMin;
          const newIntensity = cmd.command === "REST_DAY" ? "z1" : todaySession.intensity;
          const newType = result.adjusted.session.type ?? todaySession.type;
          let originalPlan = todaySession.originalPlan;
          try {
            const op = originalPlan
              ? JSON.parse(originalPlan)
              : {
                  title: todaySession.title,
                  sport: todaySession.sport,
                  type: todaySession.type,
                  intensity: todaySession.intensity,
                  durationMin: todaySession.durationMin,
                  description: todaySession.notes || "",
                  startTime: todaySession.startTime,
                };
            originalPlan = JSON.stringify({
              ...op,
              title: newTitle,
              durationMin: newDuration,
              intensity: newIntensity,
              type: newType,
            });
          } catch {}
          const restPrescription =
            cmd.command === "REST_DAY"
              ? JSON.stringify({
                  title: newTitle,
                  sport: todaySession.sport,
                  type: "recovery",
                  durationMin: 20,
                  intensity: "z1",
                  steps: [
                    { name: "Easy movement", seconds: 1200, zone: "z1", phase: "active" },
                  ],
                  targets: { rpe: 2 },
                  startTime: todaySession.startTime,
                  verdict: "rest",
                  detail: {
                    wu: "No warm-up needed.",
                    main: "20 minutes Zone 1 in any modality (walk, easy spin, swim).",
                    cd: "Finish with 5 slow nasal breaths.",
                    breathing: "Extended exhale 2:1 — 5 minutes.",
                    study: "Recovery is the training stimulus today.",
                  },
                })
              : null;
          await prisma.workout.update({
            where: { id: todaySession.id },
            data: {
              title: newTitle,
              notes: result.adjusted.session.mainSet.join("; "),
              durationMin: newDuration,
              ...(newIntensity ? { intensity: newIntensity } : {}),
              ...(cmd.command === "REST_DAY" ? { type: "recovery" } : {}),
              ...(restPrescription
                ? { prescription: restPrescription }
                : { prescription: null }),
              originalPlan,
              // A superseded prescription invalidates the watch-side approval.
              approved: false,
            },
          });
          await prisma.auditLog.create({
            data: {
              actorId: user.id,
              subjectId: user.id,
              action: "chat.trainingCommand",
              entityId: todaySession.id,
              before: JSON.stringify(before).slice(0, 2000),
              after: JSON.stringify({
                command: cmd.command,
                title: newTitle,
                durationMin: newDuration,
              }).slice(0, 2000),
              note: q.slice(0, 200),
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
        // Usage metering + error telemetry (per user).
        const um = data?.usageMetadata || {};
        await meterUsage(user.id, "ai_calls", 1);
        if (um.promptTokenCount) await meterUsage(user.id, "ai_input_tokens", um.promptTokenCount);
        if (um.candidatesTokenCount) await meterUsage(user.id, "ai_output_tokens", um.candidatesTokenCount);
        if (!answer) {
          console.warn("[assistant] No complete Gemini answer", data?.candidates?.[0]?.finishReason || "empty");
          await logEvent({ kind: "warn", source: "ai", route: "/api/assistant", userId: user.id, message: `Empty Gemini answer: ${data?.candidates?.[0]?.finishReason || "unknown"}` });
        }
      } else {
        answer = "";
        await logEvent({ kind: "warn", source: "ai", route: "/api/assistant", userId: user.id, message: `Gemini unreachable (res ${res ? res.status : "network"})` });
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
