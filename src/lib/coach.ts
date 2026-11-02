// Personal briefings are local only. External education uses coach-text-provider.
interface Briefing {
  mode: "fallback";
  headline: string;
  briefing: string;
  adaptation: string;
  sources: string[];
}

export interface CoachContext {
  name: string;
  profile: any;
  zones: any;
  readiness: { score: number; advice: string } | null;
  latestMetric: any;
  todaySession: any | null;
  planName: string | null;
  bloodFlags: string[];
  dnaHighlights: string[];
  language?: string; // en | es | ht | fr | ru
  externalAiEligible?: boolean; // legacy compatibility only; never grants external processing
  historyDigest?: string; // long-term memory: check-in trend, weekly load, adherence, benchmarks
  telemetry?: CoachTelemetry; // perf-engine-v1 compact state; replaces raw history for the AI path
}

// Account default is English (prisma User.language @default("en")). One constant, so a
// product decision to default Spanish is a one-line change rather than scattered literals.
export const COACH_FALLBACK_LANGUAGE = "en";
const lang = (l?: string) => (l && FALLBACK[l] ? l : COACH_FALLBACK_LANGUAGE);

// Localized deterministic briefings; no external AI request.
// "{title}" is replaced with the session title. Languages fall back to English.
const FALLBACK: Record<string, { green: string; amber: string; red: string; swap: string; trim: string; full: string; none: string }> = {
  en: {
    green: "Recovery markers look strong today. This is a day to take the planned key session by the horns — quality work compounds when you're fresh.",
    amber: "You're in the middle of the band — recovered enough to train, but not at full surplus. Keep the session's intent, trim the last rep or two if it bites.",
    red: "Readiness is suppressed. Today is about protecting the block: Z1 flush, mobility, and sleep. The hard work keeps for tomorrow.",
    swap: 'Swap "{title}" for a 30-min Z1 spin + 15-min mobility flow.',
    trim: 'Run "{title}" but extend the warm-up 10 min and drop the final interval set if RPE climbs early.',
    full: 'Full plan for "{title}" — chase the quality.',
    none: "No session is prescribed for today. Review your plan with your coach before adding training; keep any planned rest day.",
  },
  es: {
    green: "Tus marcadores de recuperación se ven fuertes hoy. Es día de tomar la sesión clave con ganas — el trabajo de calidad se acumula cuando estás fresco.",
    amber: "Estás en el punto medio — recuperado para entrenar, pero sin excedente. Mantén la intención de la sesión y quita la última repetición si cuesta.",
    red: "La lectura está baja. Hoy toca proteger el bloque: trote Z1, movilidad y sueño. El trabajo duro espera hasta mañana.",
    swap: 'Cambia "{title}" por 30 min de Z1 + 15 min de movilidad.',
    trim: 'Haz "{title}" pero alarga el calentamiento 10 min y quita la última serie si el esfuerzo sube pronto.',
    full: 'Plan completo para "{title}" — busca la calidad.',
    none: "Hoy no hay una sesión prescrita. Revisa el plan con tu entrenador antes de añadir entrenamiento; respeta cualquier día de descanso planificado.",
  },
  ht: {
    green: "Marco rekiperasyon yo byen jodi a. Se yon jou pou pran séans kle a tout kouraj — travay kalite a kwanze lè ou fre.",
    amber: "Ou nan mitan an — ou ka antrene, men san sipli. Kenbe entansyon séans lan, retire dènye repete a si li twò di.",
    red: "Nivo a ba. Jodi a se pou pwoteje blòk la: Z1, mobilite ak dòmi. Travay di a tann demen.",
    swap: 'Chanje "{title}" pou 30 minit Z1 + 15 minit mobilite.',
    trim: 'Fè "{title}" men alonge chofa a 10 minit epi retire dènye seri a si efò a monte twò vit.',
    full: 'Plan konplè pou "{title}" — chache kalite a.',
    none: "Pa gen séans preskri pou jodi a. Revize plan an ak antrenè ou anvan ou ajoute antrennman; respekte nenpòt jou repo ki planifye.",
  },
  fr: {
    green: "Tes marqueurs de récupération sont forts aujourd'hui. C'est le jour d'attaquer la séance clé — le travail de qualité se cumule quand tu es frais.",
    amber: "Tu es dans la zone médiane — assez récupéré pour t'entraîner, sans surplus. Garde l'intention de la séance, retire la dernière répétition si ça mord.",
    red: "Ton niveau est bas. Aujourd'hui, on protège le bloc : Z1, mobilité et sommeil. Le travail dur attend demain.",
    swap: 'Remplace "{title}" par 30 min de Z1 + 15 min de mobilité.',
    trim: "Fais \"{title}\" mais allonge l'échauffement de 10 min et retire la dernière série si l'effort monte trop tôt.",
    full: 'Plan complet pour "{title}" — va chercher la qualité.',
    none: "Aucune séance n’est prescrite aujourd’hui. Vérifie le plan avec ton entraîneur avant d’ajouter un entraînement ; respecte tout jour de repos prévu.",
  },
  ru: {
    green: "Показатели восстановления сегодня сильные. День, чтобы взять ключевую тренировку с полной отдачей — качественная работа накапливается, когда вы свежи.",
    amber: "Вы в середине диапазона — восстановились достаточно для тренировки, но без запаса. Сохраните замысел тренировки, уберите последний повтор, если тяжело.",
    red: "Показатели снижены. Сегодня важнее сохранить блок: Z1, мобильность и сон. Тяжёлая работа подождёт до завтра.",
    swap: "Замените «{title}» на 30 мин Z1 + 15 мин мобильности.",
    trim: "Выполните «{title}», но удлините разминку на 10 мин и уберите последний интервал, если нагрузка растёт слишком рано.",
    full: "Полный план на «{title}» — работайте над качеством.",
    none: "На сегодня тренировка не назначена. Обсудите план с тренером, прежде чем добавлять нагрузку; соблюдайте запланированный день отдыха.",
  },
};

export function fallbackBriefing(c: CoachContext): Briefing {
  if (c.profile?.injured) return { mode: "fallback", headline: "RECOVERY REVIEW", briefing: "The injury flag is active. Training is paused pending a recovery review.", adaptation: "Use the current rest prescription and review symptoms with your clinician or coach.", sources: [] };
  const canonical=c.todaySession?.canonical;
  if(canonical){const ready=canonical.verdict==="ready";return {mode:"fallback",headline:ready?"SAVED SESSION":canonical.verdict==="rest"?"REST":"HELD FOR REVIEW",briefing:ready?"Your current check-in and saved session are available. Review the steps and limits in Today; this is local guidance, not medical clearance.":canonical.reason,adaptation:ready?canonical.steps.map((step:any)=>`${step.name}: ${step.target.label}`).join(" · "):canonical.reason,sources:[]};}
  const assigned = c.todaySession?.prescription;
  if (assigned) {
    try {
      const p = typeof assigned === "string" ? JSON.parse(assigned) : assigned;
      return { mode: "fallback", headline: `${String(p.verdict || "planned").toUpperCase()} · ${p.title}`, briefing: "Your saved prescription is the current training instruction. Complete today's check-in before starting.", adaptation: p.detail?.main || "Review the session in Today.", sources: p.sources || [] };
    } catch {}
  }
  // Readiness alone must never create a session on an unprescribed day.
  if (!c.todaySession) {
    const message = FALLBACK[lang(c.language)].none;
    return { mode: "fallback", headline: "CHECK PLAN", briefing: message, adaptation: message, sources: [] };
  }
  if (!c.readiness) return { mode: "fallback", headline: "CHECK IN", briefing: "Current recovery data is insufficient for a readiness judgment.", adaptation: c.todaySession ? `Review “${c.todaySession.title}” and complete today's check-in; the plan has not been increased.` : "No session is prescribed. Review your plan or take the planned rest day.", sources: [] };
  const L = FALLBACK[lang(c.language)];
  const r = c.readiness?.score ?? 60;
  const state = r >= 75 ? "GREEN" : r >= 55 ? "AMBER" : "RED";
  const headline = `${state} DAY`;
  const briefing = state === "GREEN" ? L.green : state === "AMBER" ? L.amber : L.red;

  let adaptation: string;
  if (c.todaySession) {
    const t = c.todaySession.title;
    adaptation = state === "RED" ? L.swap.replace("{title}", t) : state === "AMBER" ? L.trim.replace("{title}", t) : L.full.replace("{title}", t);
  } else {
    adaptation = L.none;
  }
  return { mode: "fallback", headline, briefing, adaptation, sources: ["HRV: Buchheit 2014", "Polarized: Seiler 2009"] };
}

/** The legacy eligibility flag cannot authorize mixed-source personal context.
 * No external dispatch or legacy briefing cache exists at this boundary. */
export function getCoachBriefing(_userId: string, c: CoachContext): Briefing {
  return fallbackBriefing(c);
}

// ======================================================================
// SCIENCE COACH — ultra-low-token path (perf-engine-v1)
// The engine decides the workout; the model only narrates it. The model never
// receives raw history arrays, names, blood or DNA — one telemetry line only.
// ======================================================================

export interface CoachTelemetry {
  language?: string;
  wearableSource: string;             // whoop | oura | garmin | apple | manual | checkin
  readiness: number | null;
  verdict: string;                    // rest | easy | modulate | planned | push
  hrvZScore: number | null;
  rhrDelta: number | null;
  sleepHours: number | null;
  soreness: number | null;            // 1–5 as reported
  eccentricBand: "low" | "moderate" | "high";
  hoursSinceHighEccentric: number | null;
  acwr: number | null;
  recentRpeDelta: number | null;
  availMin: number | null;
  sport: string;
  targetZone: string;
  estTss: number | null;
  rxIntervals: string;                // deterministic step summary (never model-authored)
  fuelGPerH: number | null;           // deterministic carbohydrate target
  pivot?: string | null;
}

// 1. STATIC SYSTEM SKILL (~190 tokens; byte-identical every call so provider prompt caching applies)
export const SCIENCE_COACH_SKILL = `ROLE: Elite exercise physiologist. You NARRATE a workout already chosen by a deterministic engine; never change sport, zone, duration or intervals.
INPUT: one telemetry line. N/A = unknown, never assume good.
RULES:
1 CENTRAL vs PERIPHERAL: HRV Z>=-0.5 with high leg load means metabolic work moves to bike/swim, eccentric run/plyo protected; say why.
2 PUSH (R>=75, ACWR<1.3): explain the overload-to-supercompensation rationale and the stop rule (form breaks, pain, HR drift).
3 MODULATE/EASY/REST: explain which marker limited the day.
4 DENSITY: short T_avail = micro-interval density; long = aerobic durability + late threshold.
5 Cite only numbers present in the telemetry. <=25 words per field. No diagnosis, no medical clearance, no supplement doses.
OUTPUT: JSON only {"headline":"","briefing":"","adaptation":"","fuel":""} in LANG.`;

const fmtSigned = (n: number | null, unit: string, digits = 1) => n == null ? "N/A" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}${unit}`;

// 2. DETERMINISTIC 1-LINE TELEMETRY SERIALIZER (~55–70 tokens)
export function buildCompactTelemetryDigest(c: CoachTelemetry): string {
  const rpe = c.recentRpeDelta == null ? "N/A" : `${fmtSigned(c.recentRpeDelta, "")}${c.recentRpeDelta >= 1.5 ? "HOT" : ""}`;
  return [
    `LANG:${lang(c.language)}`,
    `SRC:${c.wearableSource || "checkin"}`,
    `R:${c.readiness ?? "N/A"} ${c.verdict.toUpperCase()}`,
    `HRV:${fmtSigned(c.hrvZScore, "SD")} RHR:${fmtSigned(c.rhrDelta, "", 0)} SLP:${c.sleepHours ?? "N/A"}h`,
    `SORE:${c.soreness ?? "N/A"}/5 ECC48:${c.eccentricBand} LAST:${c.hoursSinceHighEccentric ?? "N/A"}h`,
    `ACWR:${c.acwr != null ? c.acwr.toFixed(2) : "N/A"} RPE:${rpe}`,
    `RX:${c.sport} ${c.availMin ?? "N/A"}m ${c.targetZone.toUpperCase()} TSS~${c.estTss ?? "N/A"}${c.pivot ? ` ${c.pivot}` : ""}`,
    `CHO:${c.fuelGPerH != null ? `${c.fuelGPerH}g/h` : "N/A"}`,
  ].join("|");
}

/** Deterministic CHO target (Jeukendrup 2014): <60 min none/rinse, 60–150 min 30–60 g/h, >150 min up to 90 g/h (gut-trained). */
export function carbTargetGPerH(minutes: number | null, zone: string, gutTrained = false): number | null {
  if (minutes == null || minutes <= 0) return null;
  const z = Number(zone.replace(/[^0-9]/g, "")) || 2;
  if (minutes < 60) return z >= 4 && minutes >= 45 ? 30 : 0;
  if (minutes <= 150) return z >= 3 ? 60 : 45;
  return gutTrained ? 90 : 60;
}

export interface ScienceBriefing { mode: "ai" | "local"; headline: string; briefing: string; adaptation: string; rx_intervals: string; fuel: string; digest: string }
const CONTRACT_KEYS = ["headline", "briefing", "adaptation", "fuel"] as const;
const BANNED = /(?:https?:\/\/|www\.|<[^>]*>|```)|\b(?:diagnos\w*|cleared|clearance|cure\w*|guarantee\w*|mg\b|caffeine|cafe[ií]na|supplement\w*|suplement\w*)\b/i;

/** Strict short-key contract: exact keys, ≤180 chars each, grounded numbers only. rx_intervals is always deterministic. */
export function parseScienceReply(raw: unknown, digest: string, rx: string): ScienceBriefing | null {
  let v: any = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return null; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const keys = Object.keys(v).filter(k => k !== "rx_intervals");
  if (keys.length !== CONTRACT_KEYS.length || !CONTRACT_KEYS.every(k => typeof v[k] === "string" && v[k].trim() && v[k].length <= 180)) return null;
  const known = new Set(digest.match(/\d+(?:\.\d+)?/g) || []);
  for (const k of CONTRACT_KEYS) {
    if (BANNED.test(v[k])) return null;
    if ((v[k].match(/\d+(?:\.\d+)?/g) || []).some((n: string) => !known.has(n))) return null;
  }
  return { mode: "ai", headline: v.headline.trim(), briefing: v.briefing.trim(), adaptation: v.adaptation.trim(), fuel: v.fuel.trim(), rx_intervals: rx, digest };
}

const LOCAL: Record<string, Record<string, [string, string]>> = {
  en: { push: ["PUSH DAY", "Autonomic and tissue markers support controlled overload toward supercompensation."], planned: ["PLANNED", "Markers are within normal range: execute the planned session."], modulate: ["MODULATE", "One marker is limiting today: keep intent, trim the final set."], easy: ["EASY", "Central fatigue detected: aerobic only, prioritize sleep."], rest: ["REST", "Rest is prescribed today."] },
  es: { push: ["DÍA DE EMPUJE", "Los marcadores autonómicos y de tejido permiten una sobrecarga controlada hacia la supercompensación."], planned: ["PLANIFICADO", "Marcadores en rango normal: ejecuta la sesión planificada."], modulate: ["MODULAR", "Un marcador limita hoy: mantén la intención y recorta la última serie."], easy: ["SUAVE", "Fatiga central detectada: solo aeróbico, prioriza el sueño."], rest: ["DESCANSO", "Hoy toca descanso."] },
};
export function localScienceBriefing(t: CoachTelemetry): ScienceBriefing {
  const l = lang(t.language), table = LOCAL[l] || LOCAL.en, es = table === LOCAL.es;
  const [headline, briefing] = table[t.verdict] || table.planned;
  const parts = [t.hrvZScore != null ? `HRV ${fmtSigned(t.hrvZScore, " SD")}` : null, t.acwr != null ? `ACWR ${t.acwr.toFixed(2)}` : null, t.pivot ? t.pivot : null].filter(Boolean).join(" · ");
  const fuel = t.fuelGPerH == null ? "—" : t.fuelGPerH === 0 ? (es ? "Agua; sin carbohidrato extra necesario." : "Water; no extra carbohydrate needed.") : (es ? `~${t.fuelGPerH} g/h de carbohidrato durante la sesión.` : `~${t.fuelGPerH} g/h carbohydrate during the session.`);
  return { mode: "local", headline, briefing, adaptation: parts || (es ? "Sin datos de dispositivo; basado en el check-in." : "No device baseline; based on check-in."), rx_intervals: t.rxIntervals, fuel, digest: buildCompactTelemetryDigest(t) };
}

export interface ScienceEnv { EXTERNAL_AI_ENABLED?: string; OPENAI_API_KEY?: string; OPENAI_TEXT_MODEL?: string }
/** External narration only when (a) the route proved the context is provider-eligible
 * (no Strava-derived data — Strava API Agreement), (b) AI is enabled server-side.
 * Any failure → deterministic local briefing in the same contract. */
export async function getScienceBriefing(t: CoachTelemetry, opts: { eligible: boolean; env?: ScienceEnv; fetch?: typeof fetch; timeoutMs?: number } = { eligible: false }): Promise<ScienceBriefing> {
  const local = localScienceBriefing(t);
  const env = opts.env ?? { EXTERNAL_AI_ENABLED: process.env.EXTERNAL_AI_ENABLED, OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL };
  if (opts.eligible !== true || t.wearableSource === "strava" || env.EXTERNAL_AI_ENABLED !== "true" || !env.OPENAI_API_KEY) return local;
  const digest = local.digest;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await (opts.fetch ?? fetch)("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: controller.signal, redirect: "error",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_TEXT_MODEL || "gpt-4.1-mini-2025-04-14", store: false, temperature: 0.2, max_tokens: 300, response_format: { type: "json_object" },
        messages: [{ role: "system", content: SCIENCE_COACH_SKILL }, { role: "user", content: digest }] }),
    });
    if (!res.ok) return local;
    const text = await res.text();
    if (text.length > 16384) return local;
    const content = JSON.parse(text)?.choices?.[0]?.message?.content;
    return parseScienceReply(content, digest, t.rxIntervals) ?? local;
  } catch { return local; } finally { clearTimeout(timer); }
}
