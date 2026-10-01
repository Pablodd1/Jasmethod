// Jev web error monitor — JasMiamiMethod (owner request 2026-09-30).
// Audits key routes with TypeSafe AI's System-1 (model "jev-1") for fast,
// structured error classification, and dispatches notifications on should_alert.
//
// Modes:
//  - TYPESAFE_API_KEY set  → Jev classification per route (fast, structured).
//  - No key                → heuristic fallback (status/latency/content checks),
//    so CI never hard-depends on the API.
// Notifications: RESEND_API_KEY → email; NOTIFICATION_WEBHOOK → generic webhook.
// Usage: BASE_URL=https://jasmiamimethod.fit node scripts/jev-audit.mjs

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ROUTES = ["/", "/login", "/today", "/connectors", "/help", "/privacy", "/terms", "/sitemap.xml", "/robots.txt"];
const TIMEOUT_MS = 15000;

const results = [];
let hadTransportError = false;

async function fetchRoute(route) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${route}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "JevMonitor/1.0 (JasMiamiMethod error monitor)" },
    });
    const body = await res.text().catch(() => "");
    return { route, status: res.status, ms: Date.now() - started, body };
  } catch (e) {
    hadTransportError = true;
    return { route, status: 0, ms: Date.now() - started, body: "", error: String(e?.message || e) };
  }
}

// Heuristic fallback: objective checks only — no guessing about causes.
function heuristicCheck(r) {
  const problems = [];
  if (r.error) problems.push(`transport error: ${r.error}`);
  if (r.status >= 500) problems.push(`HTTP ${r.status} server error`);
  if (r.status === 0) problems.push("unreachable");
  if (r.status === 200 && r.route !== "/sitemap.xml" && r.route !== "/robots.txt" && r.body.length < 500)
    problems.push(`suspiciously small body (${r.body.length} bytes)`);
  if (r.ms > 5000) problems.push(`slow response ${r.ms}ms`);
  return problems;
}

// MODEL FACT (verified live 2026-09-30): api.typesafe.ai serves System-1 as
// "jev-latest" — a literal "jev-1" returns 400 Unknown model. Override via
// TYPESAFE_DEFAULT_MODEL when a future alias (e.g. jev-1) appears.
const JEV_MODEL = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";

async function jevCheck(r) {
  const { TypeSafeClient, choice, noul } = await import("@typesafe-ai/sdk");
  const client = new TypeSafeClient();
  const response = await client.systemOne({
    state: {
      route: r.route,
      http_status: r.status,
      latency_ms: r.ms,
      body_bytes: r.body.length,
      body_excerpt: r.body.slice(0, 1500),
      error: r.error ?? null,
      heuristic_problems: heuristicCheck(r),
    },
    questions: {
      // Answer-type helpers are REQUIRED — bare nulls fail client validation.
      is_operational: noul("Is this route operational for a real user right now?"),
      severity: choice("If something is wrong, how severe?", {
        none: null, low: null, medium: null, high: null, critical: null,
      }),
      should_alert: noul("Should an on-call operator be notified for this route's state?"),
    },
    model: JEV_MODEL,
  });
  return {
    is_operational: response.answers.is_operational?.noul != null
      ? response.answers.is_operational.noul >= 0.5
      : (response.answers.is_operational?.choice ?? null),
    severity: response.answers.severity?.choice ?? null,
    should_alert: response.answers.should_alert?.noul != null
      ? response.answers.should_alert.noul >= 0.5
      : (response.answers.should_alert?.choice ?? null),
    summary: `operational=${response.answers.is_operational?.noul ?? "?"}`,
  };
}

async function notify(alerts) {
  if (!alerts.length) return;
  const text = alerts
    .map((a) => `[${a.severity || "?"}] ${a.route} — ${a.summary || a.problems?.join("; ") || "not operational"}`)
    .join("\n");
  if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Jev Monitor <onboarding@resend.dev>",
        to: [process.env.NOTIFICATION_EMAIL],
        subject: `🚨 Jev: ${alerts.length} route alert(s) — ${BASE_URL}`,
        text,
      }),
      signal: AbortSignal.timeout(15000),
    }).catch((e) => console.error("[jev] Resend notify failed:", String(e?.message || e)));
  }
  if (process.env.NOTIFICATION_WEBHOOK) {
    await fetch(process.env.NOTIFICATION_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: BASE_URL, alerts, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(15000),
    }).catch((e) => console.error("[jev] webhook notify failed:", String(e?.message || e)));
  }
}

// ---- main ----
const useJev = !!process.env.TYPESAFE_API_KEY;
console.log(`[jev] auditing ${ROUTES.length} routes at ${BASE_URL} (${useJev ? "jev-1" : "heuristic fallback"})`);

for (const route of ROUTES) {
  const r = await fetchRoute(route);
  const problems = heuristicCheck(r);
  let jev = null;
  if (useJev) {
    try {
      jev = await jevCheck(r);
    } catch (e) {
      console.error(`[jev] classification failed for ${route}:`, String(e?.message || e).slice(0, 120));
    }
  }
  const shouldAlert =
    jev?.should_alert === true ||
    (jev === null && problems.length > 0 && (r.status >= 500 || r.status === 0));
  const entry = {
    route: r.route,
    status: r.status,
    ms: r.ms,
    ok: r.status >= 200 && r.status < 400 && !problems.length,
    heuristic_problems: problems,
    jev,
  };
  results.push(entry);
  console.log(
    `${entry.ok && !shouldAlert ? "✓" : "✗"} ${r.route} ${r.status} ${r.ms}ms` +
      (jev ? ` | operational=${jev.is_operational} severity=${jev.severity} alert=${jev.should_alert}` : "") +
      (problems.length ? ` | heuristic: ${problems.join("; ")}` : ""),
  );
  if (shouldAlert)
    await notify([
      {
        route: r.route,
        severity: jev?.severity || (r.status >= 500 ? "high" : "medium"),
        summary: jev?.summary,
        problems,
      },
    ]);
}

const failing = results.filter((r) => !r.ok || r.jev?.should_alert === true);
console.log(`\n[jev] done: ${results.length - failing.length}/${results.length} healthy, ${failing.length} alert(s)`);
process.exit(failing.length ? 1 : 0);
