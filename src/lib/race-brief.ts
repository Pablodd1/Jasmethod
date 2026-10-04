import { METRIC_LANGUAGE_RULES } from "./metric-language";
// JasMiamiMethod — Race Plan Brief
//
// The narrative layer of the forecast platform. Two hard rules from the
// 2026-09-08 adjudication drive the design:
//
//  1. The deterministic engine owns every number. The LLM (when enabled) is
//     a WRITER, never a source: its system prompt forbids introducing any
//     figure absent from the engine JSON, and REJECTED_CLAIMS are named as
//     banned content.
//  2. Fluency is not fact. The template below ships provenance counts and
//     "verify" warnings verbatim so the athlete always sees which numbers
//     are sourced vs tunable vs measured-defaults.

import { fmtTime, type ForecastResult } from "./raceforecast";
import { REJECTED_CLAIMS } from "./forecast-constants";
import type { RaceWeather } from "./weather";

export interface BriefContext {
  raceName?: string | null;
  dateISO?: string | null;
  daysAway?: number | null;
  weather?: RaceWeather | null;
}

// Deterministic brief — always available, no API key required.
export function buildRaceBrief(f: ForecastResult, ctx: BriefContext = {}): string {
  const L: string[] = [];
  const title = ctx.raceName || f.distanceLabel;

  L.push(`# Race plan — ${title}`);
  if (ctx.daysAway != null) L.push(`_Race day in ${Math.max(0, Math.round(ctx.daysAway))} day(s) · confidence: ${f.confidence}_`);
  else L.push(`_Confidence: ${f.confidence}_`);
  L.push("");

  // Headline
  const best = f.scenarios?.find((s) => s.label === "best")?.totalMin;
  const worst = f.scenarios?.find((s) => s.label === "worst")?.totalMin;
  L.push(`## The number`);
  L.push(
    `**${fmtTime(f.totalMin)}** expected.` +
      (best != null && worst != null ? ` Weather band: ${fmtTime(best)} (cooler, calmer) → ${fmtTime(worst)} (hotter, windier).` : "") +
      (f.goalDeltaMin != null
        ? f.goalDeltaMin > 0
          ? ` That's ${fmtTime(f.goalDeltaMin)} over your goal — the plan below is how you close it.`
          : ` That's ${fmtTime(Math.abs(f.goalDeltaMin))} under your goal — hold the plan, don't get greedy.`
        : ""),
  );
  L.push("");

  // Segments
  L.push(`## How to race it`);
  for (const s of f.segments) {
    const targets: string[] = [];
    if (s.pace) targets.push(s.pace);
    if (s.powerTargetW) targets.push(`${s.powerTargetW}W (${Math.round((s.intensityFactor ?? 0) * 100)}% FTP)`);
    if (s.speedKmh) targets.push(`${s.speedKmh} km/h`);
    if (s.hrTarget) targets.push(s.hrTarget);
    L.push(`**${s.label} — ${s.distanceLabel} · ${fmtTime(s.timeMin)}**${targets.length ? `: ${targets.join(" · ")}` : ""}`);
    for (const n of s.notes.slice(0, 2)) L.push(`- ${n}`);
    L.push("");
  }

  // Fueling + calories
  if (f.fuelTotal) {
    const p = f.fuelTotal;
    L.push(`## Fueling & calories`);
    L.push(
      p.carbsGPerHour > 0
        ? `- Carbs: **${p.carbsGPerHour} g/h** → ${p.totalCarbsG} g total (~${p.totalKcalIntake} kcal intake). ${p.carbsBand}.`
        : `- Under an hour: water only — no fuel required.`,
    );
    L.push(`- Fluid: **${p.fluidMlPerHour} ml/h** (${p.totalFluidMl} ml total) · Sodium: **${p.sodiumMgPerHour} mg/h** (${p.totalSodiumMg} mg total).`);
    if (p.estimatedKcalBurned != null)
      L.push(`- Burn: ~**${p.estimatedKcalBurned} kcal** total expenditure. Intake deliberately replaces only part — that's physiology, not an error.`);
    if (p.caffeineTiming) L.push(`- Caffeine: ${p.caffeineTiming}`);
    const firstSlots = p.slots.slice(0, 3);
    for (const s of firstSlots) L.push(`  - ${s.fromMin < 0 ? `${-s.fromMin} min before the gun` : `${s.fromMin}–${s.toMin} min`}: ${s.what}`);
    for (const g of p.gaps.slice(0, 2)) L.push(`- ⚠ ${g}`);
    L.push("");
  }

  // Weather
  if (f.wbgt) {
    L.push(`## Weather`);
    L.push(`- **WBGT ${f.wbgt.value}°C** — ${f.wbgt.zone === "ok" ? "manageable" : f.wbgt.zone.replace("_", "-")}. ${f.wbgt.note}`);
    if (f.wbgt.advisory) L.push(`- ${f.wbgt.advisory}`);
    if (ctx.weather)
      L.push(`- Forecast at start hour: ${ctx.weather.tempC}°C (${ctx.weather.condition}), wind ${ctx.weather.windKph} kph, gusts ${ctx.weather.gustsKph} kph${ctx.weather.precipMm ? `, precip ${ctx.weather.precipMm} mm` : ""}.`);
    L.push(`- _Method: ${f.wbgt.method}_`);
    L.push("");
  }

  // Wetsuit
  if (f.wetsuit) {
    L.push(`## Wetsuit call (${f.wetsuit.federation})`);
    L.push(`- ${f.wetsuit.note}`);
    L.push(`- _${f.wetsuit.citation} — rules change; verify against the current rulebook._`);
    L.push("");
  }

  // Adjustments/risks
  const topFactors = f.factors.slice(0, 5);
  if (topFactors.length) {
    L.push(`## Why the number moved`);
    for (const x of topFactors) L.push(`- ${x}`);
    L.push("");
  }

  // Gaps to measure
  if (f.measurementGaps.length) {
    L.push(`## Tighten the forecast (measure these)`);
    for (const g of f.measurementGaps.slice(0, 4)) L.push(`- ${g}`);
    L.push("");
  }

  // Provenance footer
  const prov = f.provenance ?? [];
  const byFlag = (flag: string) => prov.filter((p) => p.provenance === flag).length;
  L.push("---");
  L.push(
    `_Model provenance: ${byFlag("VERIFIED")} verified · ${byFlag("TUNED_DEFAULT")} tunable defaults · ${byFlag("LABELED_DEFAULT") + byFlag("HEURISTIC")} labeled defaults/heuristics. Tunables are starting points — tune them to your own data after each race._`,
  );
  return L.join("\n");
}

// System contract for the LLM writer. The model may reorganize and
// humanize, but every number must come from the JSON payload.
export function briefWriterSystemPrompt(): string {
  return [
    "You are the race-plan writer for JasMiamiMethod, an endurance coaching platform.",
    "You will receive a race forecast as JSON. Rewrite it as a motivating, concrete race plan in second person (\"you\").",
    METRIC_LANGUAGE_RULES,
    "HARD RULES — violating any of these makes the output unusable:",
    "1. Use ONLY numbers that appear in the JSON. Never invent, estimate, round into new values, or convert units yourself.",
    "2. If the athlete would need a number the JSON doesn't contain, write what to measure instead of making one up.",
    "3. Keep every 'verify' warning (wetsuit rules, ACSM bands) verbatim in meaning.",
    "4. These claims are banned because they were adjudicated as fabricated; never emit them even as encouragement: " +
      REJECTED_CLAIMS.map((r) => `"${r.claim}"`).join("; ") + ".",
    "5. Markdown, under 400 words, no preamble, no apologies.",
  ].join("\n");
}

export function briefWriterUserPrompt(f: ForecastResult, ctx: BriefContext): string {
  return JSON.stringify({ forecast: f, raceName: ctx.raceName ?? null, daysAway: ctx.daysAway ?? null, weather: ctx.weather ?? null });
}
