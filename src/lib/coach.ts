// JasMiamiMethod — AI Coach (Gemini Flash via Google AI Studio, direct API).
// Caches one briefing per user/day and serves instantly; generation runs fire-and-forget
// in the background and backfills the cache. (ponytail: in-memory Map — survives across
// requests in one server process; swap for a DB row if you go multi-instance.)

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash"; // 3.6 = latest on generateContent; 3.7 needs the new Interactions API

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
}

function fallbackBriefing(c: CoachContext): Briefing {
  const r = c.readiness?.score ?? 60;
  const state = r >= 75 ? "GREEN" : r >= 55 ? "AMBER" : "RED";
  const headline = `${state} DAY`;
  let briefing = "";
  if (state === "GREEN")
    briefing = "Recovery markers look strong today. This is a day to take the planned key session by the horns — quality work compounds when you're fresh.";
  else if (state === "AMBER")
    briefing = "You're in the middle of the band — recovered enough to train, but not at full surplus. Keep the session's intent, trim the last rep or two if it bites.";
  else
    briefing = "Readiness is suppressed. Today is about protecting the block: Z1 flush, mobility, and sleep. The hard work keeps for tomorrow.";

  let adaptation = "";
  if (c.todaySession) {
    adaptation = state === "RED"
      ? `Swap "${c.todaySession.title}" for a 30-min Z1 spin + 15-min mobility flow.`
      : state === "AMBER"
      ? `Run "${c.todaySession.title}" but extend the warm-up 10 min and drop the final interval set if RPE climbs early.`
      : `Full plan for "${c.todaySession.title}" — chase the quality.`;
  } else {
    adaptation = "No session loaded for today — a good day for an easy 40-min Z2 cross-train or total rest.";
  }
  return { mode: "fallback", headline, briefing, adaptation, sources: ["HRV: Buchheit 2014", "Polarized: Seiler 2009"] };
}

function buildPrompt(c: CoachContext): string {
  const p = c.profile || {};
  const m = c.latestMetric || {};
  const LANG_NAMES: Record<string, string> = { en: "English", es: "Spanish", ht: "Haitian Creole", fr: "French", ru: "Russian" };
  const langName = LANG_NAMES[c.language || "en"] || "English";
  return `You are Coach Jas, a science-backed triathlon coach for ${c.name || "this athlete"}.
Athlete profile: sex=${p.sex || "n/a"}, age=${p.birthYear ? new Date().getFullYear() - p.birthYear : "n/a"}, experience=${p.experience || "n/a"}, goal=${p.goal || "n/a"}.
Physiology: VO2max=${p.vo2max ?? "n/a"}, LTHR=${p.lthr ?? "n/a"}, FTP=${p.ftp ?? "n/a"}.
Readiness score (0-100): ${c.readiness?.score ?? "n/a"} — ${c.readiness?.advice ?? "no HRV data"}.
Latest morning metric: HRV=${m.hrv ?? "n/a"} ms, restingHR=${m.restingHr ?? m.rhr ?? "n/a"}, sleep=${m.sleepHours ?? "n/a"} h.
Today's planned session: ${c.todaySession ? `${c.todaySession.title} (${c.todaySession.durationMin} min, ${c.todaySession.intensity || "Z2"}, ${c.todaySession.sport})` : "none"}.
Active plan: ${c.planName ?? "none"}.
Blood flags: ${c.bloodFlags.length ? c.bloodFlags.join("; ") : "none on file"}.
DNA highlights: ${c.dnaHighlights.length ? c.dnaHighlights.join("; ") : "none on file"}.
Language: respond entirely in ${langName}.

Respond in strict JSON: {"headline": "<GREEN|AMBER|RED> DAY — short tag", "briefing": "<2-3 sentences, coach voice, Miami-flavored, evidence-based>", "adaptation": "<one concrete change to today's training based on readiness>", "sources": ["<author year>", ...]}.
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
        // NOTE: no `temperature` — Gemini 3.x flash is a thinking model and rejects it.
        generationConfig: { maxOutputTokens: 1024, responseMimeType: "application/json" },
      }),
      signal: ctrl.signal,
    }).then(async (res) => {
      clearTimeout(t);
      if (!res.ok) { console.error("[coach] Gemini HTTP", res.status); return resolve(fallbackBriefing(c)); }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = JSON.parse(text);
      resolve({
        mode: "gemini",
        headline: parsed.headline || fallbackBriefing(c).headline,
        briefing: parsed.briefing || fallbackBriefing(c).briefing,
        adaptation: parsed.adaptation || fallbackBriefing(c).adaptation,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      });
    }).catch((e) => { clearTimeout(t); console.error("[coach] Gemini error:", String(e?.message || e)); resolve(fallbackBriefing(c)); });
  });
}

// Returns a briefing instantly. If a fresh ox-alpha result is cached, returns it.
// Otherwise returns fallback immediately and kicks off background ox-alpha generation
// that backfills the cache (so the next load shows the real model output).
export function getCoachBriefing(userId: string, c: CoachContext): Briefing {
  const tk = todayKey();
  const hit = cache.get(userId);
  if (hit && hit.date === tk) return hit.briefing;

  if (!pending.has(userId)) {
    pending.add(userId);
    geminiBriefing(c).then((b) => {
      // ponytail: only cache a real model result. Caching fallback would pin the
      // user to rule-based output all day after a single 429/timeout — wrong.
      if (b.mode === "gemini") {
        cache.set(userId, { date: tk, briefing: b });
      }
      pending.delete(userId);
    }).catch(() => pending.delete(userId));
  }
  // serve anything we already have (stale from yesterday) or fallback
  return hit?.briefing ?? fallbackBriefing(c);
}
