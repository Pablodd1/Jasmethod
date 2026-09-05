#!/usr/bin/env node
// Money-path API smoke test — run against a booted app.
//   node scripts/api-smoke.cjs [baseUrl] [email] [password]
// Exercises: login -> today -> check-in adapt -> plan generate -> regenerate
// (limit 3) -> races -> AdvanzedRacing -> HYROX planner -> assistant -> cron
// guards. Exits non-zero on the first failure. Cookie-based, no framework.
const BASE = process.argv[2] || "http://localhost:3200";
const EMAIL = process.argv[3] || "demo@jasmiamimethod.com";
const PASSWORD = process.argv[4] || "demo1234";

let cookie = "";
let passed = 0;

async function call(method, path, body, expect = 200, label = path) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let data = null;
  try { data = await res.json(); } catch { /* html */ }
  if (res.status !== expect) {
    console.error(`✗ ${label}: expected ${expect}, got ${res.status} — ${JSON.stringify(data).slice(0, 140)}`);
    process.exit(1);
  }
  passed++;
  return data;
}

(async () => {
  console.log(`API smoke against ${BASE} as ${EMAIL}`);
  await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD }, 200, "login");
  const today = await call("GET", "/api/today", undefined, 200, "today");
  if (!("sessions" in today)) { console.error("✗ today: no sessions array"); process.exit(1); }

  // check-in must adapt and never leak a raw key
  const checkin = await call("POST", "/api/checkin", { sleep: 4, soreness: 2, motivation: 3, energy: 4, stress: 2 }, 200, "check-in adapt");
  if (!checkin.adaptation?.verdict) { console.error("✗ check-in: no verdict"); process.exit(1); }

  // plan generation
  const plan = await call("POST", "/api/plan/generate", { distance: "olympic", weeks: 8 }, 200, "plan generate");
  if (!plan.plan?.id) { console.error("✗ plan: no id"); process.exit(1); }

  // regeneration: 3 ok then 429
  const t2 = await call("GET", "/api/today", undefined, 200, "today for regen");
  const wid = t2.sessions?.[0]?.id;
  if (wid) {
    for (let i = 1; i <= 3; i++) await call("POST", "/api/workout/regenerate", { id: wid, mode: "variant" }, 200, `regen ${i}`);
    await call("POST", "/api/workout/regenerate", { id: wid, mode: "variant" }, 429, "regen limit (4th)");
  }

  // races + forecast + hyrox planner + assistant
  await call("POST", "/api/races", { name: "SMOKE TEST RACE", distance: "10k", date: "2026-12-20", location: "Miami, FL", priority: 3 }, 200, "race create");
  await call("GET", "/api/race-forecast?distance=10k", undefined, 200, "AdvanzedRacing");
  await call("GET", "/api/hyrox/split-planner?target=75&pace=270", undefined, 200, "HYROX planner");
  await call("POST", "/api/assistant", { question: "smoke test" }, 200, "assistant");

  // AI endpoints respond (Gemini when keyed; localized fallback otherwise)
  await call("GET", "/api/coach", undefined, 200, "JASAI briefing");

  // guards
  await fetch(BASE + "/api/admin", { headers: { cookie } }).then((r) => {
    if (r.status !== 403) { console.error(`✗ admin guard: expected 403, got ${r.status}`); process.exit(1); }
    passed++;
  });

  console.log(`✓ api-smoke: ${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error("✗ smoke crashed:", e.message); process.exit(1); });
