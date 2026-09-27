// JasMiamiMethod — AI Coach (Gemini Flash via Google AI Studio, direct API).
// Caches a briefing for the current athlete context and serves instantly; generation runs fire-and-forget
// in the background and backfills the cache. (ponytail: in-memory Map — survives across
// requests in one server process; swap for a DB row if you go multi-instance.)

import { createHash } from "node:crypto";
import { protocolCoachContext } from "./protocols";
import { geminiAnswer, geminiGenerationConfig } from "./gemini-response";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

interface Briefing {
  mode: "gemini" | "fallback";
  headline: string;
  briefing: string;
  adaptation: string;
  sources: string[];
}

const cache = new Map<string, { date: string; briefing: Briefing }>();
const pending = new Set<string>();

function todayKey() { return new Date().toISOString().slice(0, 10); }

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
  externalAiEligible?: boolean; // explicit policy boundary; omitted contexts stay local
  historyDigest?: string; // long-term memory: check-in trend, weekly load, adherence, benchmarks
}

// Localized rule-based fallback briefings (used when Gemini is unavailable).
// "{title}" is replaced with the session title. Languages fall back to English.
const FALLBACK: Record<string, { green: string; amber: string; red: string; swap: string; trim: string; full: string; none: string }> = {
  en: {
    green: "Recovery markers look strong today. This is a day to take the planned key session by the horns — quality work compounds when you're fresh.",
    amber: "You're in the middle of the band — recovered enough to train, but not at full surplus. Keep the session's intent, trim the last rep or two if it bites.",
    red: "Readiness is suppressed. Today is about protecting the block: Z1 flush, mobility, and sleep. The hard work keeps for tomorrow.",
    swap: 'Swap "{title}" for a 30-min Z1 spin + 15-min mobility flow.',
    trim: 'Run "{title}" but extend the warm-up 10 min and drop the final interval set if RPE climbs early.',
    full: 'Full plan for "{title}" — chase the quality.',
    none: "No session loaded for today — a good day for an easy 40-min Z2 cross-train or total rest.",
  },
  es: {
    green: "Tus marcadores de recuperación se ven fuertes hoy. Es día de tomar la sesión clave con ganas — el trabajo de calidad se acumula cuando estás fresco.",
    amber: "Estás en el punto medio — recuperado para entrenar, pero sin excedente. Mantén la intención de la sesión y quita la última repetición si cuesta.",
    red: "La lectura está baja. Hoy toca proteger el bloque: trote Z1, movilidad y sueño. El trabajo duro espera hasta mañana.",
    swap: 'Cambia "{title}" por 30 min de Z1 + 15 min de movilidad.',
    trim: 'Haz "{title}" pero alarga el calentamiento 10 min y quita la última serie si el esfuerzo sube pronto.',
    full: 'Plan completo para "{title}" — busca la calidad.',
    none: "Hoy no hay sesión cargada — buen día para 40 min suaves de Z2 o descanso total.",
  },
  ht: {
    green: "Marco rekiperasyon yo byen jodi a. Se yon jou pou pran séans kle a tout kouraj — travay kalite a kwanze lè ou fre.",
    amber: "Ou nan mitan an — ou ka antrene, men san sipli. Kenbe entansyon séans lan, retire dènye repete a si li twò di.",
    red: "Nivo a ba. Jodi a se pou pwoteje blòk la: Z1, mobilite ak dòmi. Travay di a tann demen.",
    swap: 'Chanje "{title}" pou 30 minit Z1 + 15 minit mobilite.',
    trim: 'Fè "{title}" men alonge chofa a 10 minit epi retire dènye seri a si efò a monte twò vit.',
    full: 'Plan konplè pou "{title}" — chache kalite a.',
    none: "Pa gen séans jodi a — bon jou pou 40 minit Z2 fasil oswa repo total.",
  },
  fr: {
    green: "Tes marqueurs de récupération sont forts aujourd'hui. C'est le jour d'attaquer la séance clé — le travail de qualité se cumule quand tu es frais.",
    amber: "Tu es dans la zone médiane — assez récupéré pour t'entraîner, sans surplus. Garde l'intention de la séance, retire la dernière répétition si ça mord.",
    red: "Ton niveau est bas. Aujourd'hui, on protège le bloc : Z1, mobilité et sommeil. Le travail dur attend demain.",
    swap: 'Remplace "{title}" par 30 min de Z1 + 15 min de mobilité.',
    trim: "Fais \"{title}\" mais allonge l'échauffement de 10 min et retire la dernière série si l'effort monte trop tôt.",
    full: 'Plan complet pour "{title}" — va chercher la qualité.',
    none: "Pas de séance aujourd'hui — bon jour pour 40 min de Z2 facile ou du repos complet.",
  },
  ru: {
    green: "Показатели восстановления сегодня сильные. День, чтобы взять ключевую тренировку с полной отдачей — качественная работа накапливается, когда вы свежи.",
    amber: "Вы в середине диапазона — восстановились достаточно для тренировки, но без запаса. Сохраните замысел тренировки, уберите последний повтор, если тяжело.",
    red: "Показатели снижены. Сегодня важнее сохранить блок: Z1, мобильность и сон. Тяжёлая работа подождёт до завтра.",
    swap: "Замените «{title}» на 30 мин Z1 + 15 мин мобильности.",
    trim: "Выполните «{title}», но удлините разминку на 10 мин и уберите последний интервал, если нагрузка растёт слишком рано.",
    full: "Полный план на «{title}» — работайте над качеством.",
    none: "На сегодня тренировки нет — хороший день для 40 мин лёгкого Z2 или полного отдыха.",
  },
};

export function fallbackBriefing(c: CoachContext): Briefing {
  if (c.profile?.injured) return { mode: "fallback", headline: "RECOVERY REVIEW", briefing: "The injury flag is active. Training is paused pending a recovery review.", adaptation: "Use the current rest prescription and review symptoms with your clinician or coach.", sources: [] };
  const assigned = c.todaySession?.prescription;
  if (assigned) {
    try {
      const p = typeof assigned === "string" ? JSON.parse(assigned) : assigned;
      return { mode: "fallback", headline: `${String(p.verdict || "planned").toUpperCase()} · ${p.title}`, briefing: "Your saved prescription is the current training instruction. Complete today's check-in before starting.", adaptation: p.detail?.main || "Review the session in Today.", sources: p.sources || [] };
    } catch {}
  }
  if (!c.readiness) return { mode: "fallback", headline: "CHECK IN", briefing: "Current recovery data is insufficient for a readiness judgment.", adaptation: c.todaySession ? `Review “${c.todaySession.title}” and complete today's check-in; the plan has not been increased.` : "No session is prescribed. Review your plan or take the planned rest day.", sources: [] };
  const L = FALLBACK[c.language || "en"] || FALLBACK.en;
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

function buildPrompt(c: CoachContext): string {
  const p = c.profile || {};
  const m = c.latestMetric || {};
  const LANG_NAMES: Record<string, string> = { en: "English", es: "Spanish", ht: "Haitian Creole", fr: "French", ru: "Russian" };
  const langName = LANG_NAMES[c.language || "es"] || "English";
  return `You are KCoach, a research-informed training coach for ${c.name || "this athlete"}.
Athlete profile: sex=${p.sex || "n/a"}, age=${p.birthYear ? new Date().getFullYear() - p.birthYear : "n/a"}, experience=${p.experience || "n/a"}, goal=${p.goal || "n/a"}.
Injury flag: ${p.injured ? "active: training paused" : "not recorded"}.
Physiology: VO2max=${p.vo2max ?? "n/a"}, LTHR=${p.lthr ?? "n/a"}, FTP=${p.ftp ?? "n/a"}.
Readiness score (0-100): ${c.readiness?.score ?? "n/a"} — ${c.readiness?.advice ?? "no HRV data"}.
Latest morning metric: HRV=${m.hrv ?? "n/a"} ms, restingHR=${m.restingHr ?? m.rhr ?? "n/a"}, sleep=${m.sleepHours ?? "n/a"} h.
Today's planned session: ${c.todaySession ? `${c.todaySession.title} (${c.todaySession.durationMin} min, ${c.todaySession.intensity || "Z2"}, ${c.todaySession.sport})` : "none"}.
Active plan: ${c.planName ?? "none"}.
Blood flags: ${c.bloodFlags.length ? c.bloodFlags.join("; ") : "none on file"}.
DNA highlights: ${c.dnaHighlights.length ? c.dnaHighlights.join("; ") : "none on file"}.
Athlete history (analyze this BEFORE advising):
${c.historyDigest || "no history yet"}
${protocolCoachContext(c.todaySession ? [c.todaySession] : [])}

Coaching rules: use only current observations to judge readiness. Missing or stale HRV means uncertainty, not a red day. Review symptoms and performance with recovery trends; a single wearable score is not a diagnosis. Completion alone is not permission to increase training. An injury flag or saved rest decision takes precedence. Never invent measurements or sources. Do not override the saved prescription; propose changes through the reviewed protocol workflow.

Language: respond entirely in ${langName}.

Respond in strict JSON: {"headline": "<GREEN|AMBER|RED|CHECK IN> — short tag", "briefing": "<2-3 sentences>", "adaptation": "<explain the saved prescription or the next review step>", "sources": ["<verified author year>", ...]}.
Keep it tight. No markdown. Under 90 words total.`;
}

function geminiBriefing(c: CoachContext): Promise<Briefing> {
  return new Promise((resolve) => {
    if (!GEMINI_KEY) { console.error("[coach] GEMINI_API_KEY missing"); return resolve(fallbackBriefing(c)); }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000); // flash models answer in ~1-2s; 20s headroom
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(c) }] }],
        generationConfig: { ...geminiGenerationConfig(GEMINI_MODEL), responseMimeType: "application/json" },
      }),
      signal: ctrl.signal,
    }).then(async (res) => {
      clearTimeout(t);
      if (!res.ok) { console.error("[coach] Gemini HTTP", res.status); return resolve(fallbackBriefing(c)); }
      const data = await res.json();
      const text = geminiAnswer(data);
      if (!text) return resolve(fallbackBriefing(c));
      const parsed = JSON.parse(text);
      if (!parsed || ![parsed.headline, parsed.briefing, parsed.adaptation].every((value) => typeof value === "string" && value.trim())) return resolve(fallbackBriefing(c));
      resolve({
        mode: "gemini",
        headline: parsed.headline || fallbackBriefing(c).headline,
        briefing: parsed.briefing || fallbackBriefing(c).briefing,
        adaptation: parsed.adaptation || fallbackBriefing(c).adaptation,
        sources: Array.isArray(parsed.sources) ? parsed.sources.filter((source: unknown) => typeof source === "string") : [],
      });
    }).catch((e) => { clearTimeout(t); console.error("[coach] Gemini error:", String(e?.message || e)); resolve(fallbackBriefing(c)); });
  });
}

// Returns a briefing instantly. If a fresh JASAI result is cached, returns it.
// Otherwise returns fallback immediately and kicks off background JASAI generation
// that backfills the cache (so the next load shows the real model output).
export function getCoachBriefing(userId: string, c: CoachContext): Briefing {
  if (process.env.EXTERNAL_AI_ENABLED !== "true" || !c.externalAiEligible) return fallbackBriefing(c);
  const tk = todayKey() + createHash("sha256").update(JSON.stringify(c)).digest("hex");
  const hit = cache.get(userId);
  if (hit && hit.date === tk) return hit.briefing;

  const pendingKey = userId + tk;
  if (!pending.has(pendingKey)) {
    pending.add(pendingKey);
    geminiBriefing(c).then((b) => {
      // ponytail: only cache a real model result. Caching fallback would pin the
      // user to rule-based output all day after a single 429/timeout — wrong.
      if (b.mode === "gemini") {
        cache.set(userId, { date: tk, briefing: b });
      }
      pending.delete(pendingKey);
    }).catch(() => pending.delete(pendingKey));
  }
  // Changed athlete data must not reuse advice from an older context.
  return fallbackBriefing(c);
}
