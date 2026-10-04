import { METRIC_LANGUAGE_RULES } from "./metric-language";
// KCoach Chat — the grounded coach conversation (owner request 2026-09-30:
// "a chat fine-tuned on the athlete profile, data, history, race prediction
// — as a chat with a coach"). The Codex no-mutation doctrine is preserved:
// chat NEVER rewrites training; it reads context and answers.
//
// Grounding rules:
// - Context is gathered SERVER-SIDE from the athlete's own records.
// - Local mode (default): answers are computed from real numbers —
//   deterministic, honest, zero external calls.
// - External mode (explicit per-question consent + EXTERNAL_AI_ENABLED):
//   the question PLUS a compact context digest go to Gemini, disclosed to
//   the athlete. No raw provider payloads, no tokens, no credentials.
import { prisma } from "./db";
import { dayBounds, dateKey } from "./dates";

export interface ChatContext {
  name: string;
  language: string;
  profileSummary: string;
  anchorsSummary: string;
  readinessSummary: string;
  metricsSummary: string;
  trainingSummary: string;
  historySummary: string;
  raceSummary: string;
  todaySummary: string;
}

export async function buildChatContext(
  userId: string,
  timezone: string,
): Promise<ChatContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, language: true },
  });
  if (!user) return null;
  const { start, end } = dayBounds(timezone);
  const since30 = new Date(Date.now() - 30 * 86400000);

  const [profile, metrics, todayWorkouts, recentActivities, race, plan, checkin] =
    await Promise.all([
      prisma.athleteProfile.findUnique({ where: { userId } }),
      prisma.dailyMetrics.findMany({
        where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
        orderBy: { date: "desc" },
        take: 7,
      }),
      prisma.workout.findMany({
        where: { userId, date: { gte: start, lt: end }, planned: true },
        include: { planDay: { select: { dayOff: true } } },
        orderBy: { startTime: "asc" },
      }),
      prisma.workout.findMany({
        where: { userId, planned: false, completed: true, date: { gte: since30 } },
        orderBy: { date: "desc" },
        take: 10,
        select: { sport: true, durationMin: true, distanceKm: true, avgHr: true, date: true, tss: true },
      }),
      prisma.race.findFirst({
        where: { userId, date: { gte: start } },
        orderBy: [{ priority: "asc" }, { date: "asc" }],
      }),
      prisma.trainingPlan.findFirst({
        where: { userId, status: "active" },
        orderBy: { createdAt: "desc" },
        select: { name: true, distance: true, weeks: true, startDate: true },
      }),
      prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId, date: start } },
        select: { answers: true, adaptation: true },
      }),
    ]);

  const p = profile || ({} as any);
  const profileSummary = [
    p.goal ? `goal: ${p.goal}` : null,
    p.experience ? `level: ${p.experience}` : null,
    p.weeklyHours ? `planned hours/week: ${p.weeklyHours}` : null,
    p.restingHr ? `resting HR: ${p.restingHr}` : null,
    p.hrvBaseline ? `HRV baseline: ${p.hrvBaseline}ms` : null,
    p.weightKg ? `weight: ${Math.round(p.weightKg)}kg` : null,
    p.injured ? "INJURED — all guidance must respect recovery" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const anchors = [
    p.ftp ? `FTP ${p.ftp}W` : null,
    p.lthr ? `LTHR ${p.lthr}` : null,
    p.runPaceBase ? `threshold run pace ${Math.floor(p.runPaceBase / 60)}:${String(Math.round(p.runPaceBase % 60)).padStart(2, "0")}/km` : null,
    p.vo2max ? `VO2max ${p.vo2max}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const latest = metrics[0];
  const readinessSummary = checkin?.adaptation
    ? (() => {
        try {
          const a = JSON.parse(checkin.adaptation);
          return a.verdict ? `today's verdict: ${a.verdict} (factor ${a.durationFactor})` : null;
        } catch {
          return null;
        }
      })() ?? null
    : null;

  const metricsSummary = latest
    ? `latest device data: HRV ${latest.hrv ?? "—"}ms, resting HR ${latest.restingHr ?? "—"}, sleep ${latest.sleepHours ?? "—"}h, recovery ${latest.recoveryScore ?? "—"}% (${latest.date.toISOString().slice(0, 10)})`
    : "no device data yet";

  const todaySummary = todayWorkouts.length
    ? todayWorkouts
        .map((w) =>
          w.planDay?.dayOff
            ? "day off protocol"
            : `${w.title} — ${w.durationMin}min ${(w.intensity || "z2").toUpperCase()}${w.completed ? " (completed)" : ""}`,
        )
        .join("; ")
    : "no session planned today";

  const trainingSummary = plan
    ? `active plan "${plan.name || plan.distance}" (${plan.weeks} weeks from ${plan.startDate.toISOString().slice(0, 10)})`
    : "no active plan";

  const weekMin = recentActivities.reduce((a, w) => a + w.durationMin, 0);
  const historySummary = recentActivities.length
    ? `last 30d: ${recentActivities.length} completed sessions, ${Math.round(weekMin / 60)}h total; recent: ${recentActivities
        .slice(0, 5)
        .map((w) => `${w.sport} ${w.durationMin}min${w.distanceKm ? ` ${w.distanceKm.toFixed(1)}km` : ""}${w.avgHr ? ` HR ${w.avgHr}` : ""}`)
        .join(", ")}`
    : "no completed activities in the last 30 days";

  const raceSummary = race
    ? `next race: ${race.name} (${race.distance || "?"}), ${Math.max(0, Math.round((Date.parse(dateKey(race.date, timezone)) - Date.parse(dateKey(new Date(), timezone))) / 86400000))} days out${race.goalTimeMin ? `, goal ${Math.floor(race.goalTimeMin / 60)}h${race.goalTimeMin % 60}m` : ""}`
    : "no upcoming race";

  return {
    name: user.name,
    language: user.language || "en",
    profileSummary,
    anchorsSummary: anchors || "no measured anchors yet — suggest adding a 5K time or FTP in Profile & Zones",
    readinessSummary: readinessSummary || "no check-in yet today",
    metricsSummary,
    trainingSummary,
    historySummary,
    raceSummary,
    todaySummary,
  };
}

// ---- Local grounded answers (no AI, real numbers) ----

export function localGroundedAnswer(
  question: string,
  ctx: ChatContext,
): string {
  const q = question.toLowerCase();
  const es = ctx.language === "es";
  const parts: string[] = [];

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("race", "carrera", "predict", "pronostico", "pronóstico", "finish", "meta")) {
    parts.push(ctx.raceSummary);
    parts.push(
      es
        ? "El pronóstico completo (con clima, viento y perfil del recorrido) vive en Races → AdvanzedRacing forecast, y se recalcula con cada dato nuevo."
        : "The full forecast (weather, wind, course profile) lives in Races → AdvanzedRacing forecast, and recalculates as your data changes.",
    );
  } else if (has("hrv", "recovery", "recuper", "readiness", "listo", "fatigue", "fatiga", "tired", "cansad")) {
    parts.push(ctx.metricsSummary);
    if (ctx.readinessSummary) parts.push(ctx.readinessSummary);
    parts.push(
      es
        ? "Regla: HRV bajo tu base de 7 días + mal sueño = volumen recortado, no intensidad cancelada. El veredicto de hoy ya aplicó esto."
        : "Rule: HRV below your 7-day baseline + poor sleep = trimmed volume, not cancelled intensity. Today's verdict already applied this.",
    );
  } else if (has("today", "hoy", "session", "sesion", "sesión", "workout", "train")) {
    parts.push(`${es ? "Hoy" : "Today"}: ${ctx.todaySummary}.`);
    parts.push(ctx.metricsSummary);
  } else if (has("pace", "ritmo", "ftp", "threshold", "umbral", "zone", "zona", "heart rate", "frecuencia")) {
    parts.push(ctx.anchorsSummary);
    parts.push(
      es
        ? "Los anclajes se actualizan con tests (Labs) o resultados de 5K/CSS — y cada pronóstico y zona se recalcula con ellos."
        : "Anchors update from tests (Labs) or 5K/CSS results — every forecast and zone recalculates from them.",
    );
  } else if (has("history", "historico", "histórico", "progress", "progreso", "week", "semana", "volume", "volumen")) {
    parts.push(ctx.historySummary);
    parts.push(ctx.trainingSummary);
  } else {
    parts.push(
      es
        ? `Resumen del atleta: ${ctx.profileSummary || "perfil incompleto"}.`
        : `Athlete snapshot: ${ctx.profileSummary || "profile incomplete"}.`,
    );
    parts.push(ctx.metricsSummary);
    parts.push(`${es ? "Hoy" : "Today"}: ${ctx.todaySummary}.`);
    parts.push(ctx.raceSummary);
  }
  parts.push(
    es
      ? "No he modificado ningún entrenamiento — los cambios se confirman en el editor."
      : "No training has been modified — changes are confirmed in the editor.",
  );
  return parts.join("\n");
}

// ---- Gemini grounded payload (consent-gated) ----

export function groundedQuestionPayload(question: string, ctx: ChatContext) {
  const system = `You are KCoach, the coach of JasMiamiMethod, speaking directly to athlete ${ctx.name}. Answer in ${ctx.language === "es" ? "Spanish" : "English"}. You are a science-based endurance coach: cite the athlete's own numbers, be concrete, honest about uncertainty, never invent data, never prescribe medical care. You CANNOT modify training in the app — if the athlete asks for changes, tell them to use the training editor. Keep it under 180 words.

${METRIC_LANGUAGE_RULES}

ATHLETE CONTEXT (from the app):
- Profile: ${ctx.profileSummary || "incomplete"}
- Anchors: ${ctx.anchorsSummary}
- Readiness: ${ctx.readinessSummary}
- Devices: ${ctx.metricsSummary}
- Plan: ${ctx.trainingSummary}
- Today: ${ctx.todaySummary}
- History: ${ctx.historySummary}
- Race: ${ctx.raceSummary}`;
  return {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: question }] }],
  };
}
