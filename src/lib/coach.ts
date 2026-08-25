// JasMiamiMethod — AI Coach (ox-alpha via OpenRouter)
// ox-alpha is a reasoning model (~115s latency), so we never block a page load on it.
// We cache one briefing per user/day and serve it instantly; ox-alpha generation runs
// fire-and-forget in the background and backfills the cache. (ponytail: in-memory Map —
// survives across requests in one server process; swap for a DB row if you go multi-instance.)

const OR_KEY = process.env.OPENROUTER_API_KEY;
const OR_MODEL = process.env.OPENROUTER_MODEL || "stealth/ox-alpha";

interface Briefing {
  mode: "ox-alpha" | "fallback";
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
  return `You are Coach Jas, a science-backed triathlon coach for ${c.name || "this athlete"}.
Athlete profile: sex=${p.sex || "n/a"}, age=${p.birthYear ? new Date().getFullYear() - p.birthYear : "n/a"}, experience=${p.experience || "n/a"}, goal=${p.goal || "n/a"}.
Physiology: VO2max=${p.vo2max ?? "n/a"}, LTHR=${p.lthr ?? "n/a"}, FTP=${p.ftp ?? "n/a"}.
Readiness score (0-100): ${c.readiness?.score ?? "n/a"} — ${c.readiness?.advice ?? "no HRV data"}.
Latest morning metric: HRV=${m.hrv ?? "n/a"} ms, restingHR=${m.restingHr ?? m.rhr ?? "n/a"}, sleep=${m.sleepHours ?? "n/a"} h.
Today's planned session: ${c.todaySession ? `${c.todaySession.title} (${c.todaySession.durationMin} min, ${c.todaySession.intensity || "Z2"}, ${c.todaySession.sport})` : "none"}.
Active plan: ${c.planName ?? "none"}.
Blood flags: ${c.bloodFlags.length ? c.bloodFlags.join("; ") : "none on file"}.
DNA highlights: ${c.dnaHighlights.length ? c.dnaHighlights.join("; ") : "none on file"}.

Respond in strict JSON: {"headline": "<GREEN|AMBER|RED> DAY — short tag", "briefing": "<2-3 sentences, coach voice, Miami-flavored, evidence-based>", "adaptation": "<one concrete change to today's training based on readiness>", "sources": ["<author year>", ...]}.
Keep it tight. No markdown. Under 90 words total.`;
}

function oxAlphaBriefing(c: CoachContext): Promise<Briefing> {
  return new Promise((resolve) => {
    if (!OR_KEY) return resolve(fallbackBriefing(c));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 130000); // ox-alpha ~115s; give headroom
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OR_KEY}`, "HTTP-Referer": "https://jasmiamimethod.com", "X-Title": "JasMiamiMethod" },
      body: JSON.stringify({
        model: OR_MODEL,
        messages: [{ role: "user", content: buildPrompt(c) }],
        temperature: 0.6,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: ctrl.signal,
    }).then(async (res) => {
      clearTimeout(t);
      if (!res.ok) return resolve(fallbackBriefing(c));
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || "";
      const parsed = JSON.parse(text);
      resolve({
        mode: "ox-alpha",
        headline: parsed.headline || fallbackBriefing(c).headline,
        briefing: parsed.briefing || fallbackBriefing(c).briefing,
        adaptation: parsed.adaptation || fallbackBriefing(c).adaptation,
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      });
    }).catch(() => { clearTimeout(t); resolve(fallbackBriefing(c)); });
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
    oxAlphaBriefing(c).then((b) => {
      // ponytail: only cache a real model result. Caching fallback would pin the
      // user to rule-based output all day after a single 429/timeout — wrong.
      if (b.mode === "ox-alpha") {
        cache.set(userId, { date: tk, briefing: b });
      }
      pending.delete(userId);
    }).catch(() => pending.delete(userId));
  }
  // serve anything we already have (stale from yesterday) or fallback
  return hit?.briefing ?? fallbackBriefing(c);
}
