# JMM — Advanced Race Prediction, Science Coaching & Delivery: Development Brief

**From:** Jas (owner) · **To:** platform development team
**Date:** 2026-10-15 · **Status:** requirements — implement in priority order
**Context:** Strava (June-2026 developer-program changes) and Garmin (developer program paused indefinitely) are out of easy reach. Delivery is manual-first until an alternative path is proven. This brief defines what to build so the product's *science and coaching value* does not depend on any single platform's API policy.

---

## 0. Current state (verified, so we don't rebuild what exists)

Already implemented and verified in the app: adaptive daily prescriptions from check-in + device recovery; A/B/C race calendar with race-anchored taper (−41–60% volume, intensity held); PMC projection to race day; equipment-aware bike physics (CdA by setup); GPX course ingestion (distance, elevation, sampled profile); per-segment pacing tables (bike watts / run pace) with gust-aware uncertainty bands; race-forecast snapshots (pre-race prediction vs actual result error); KCoach activity reports; fueling engine (carbs/fluid/sodium, gut-training progression); device-free baseline testing; Intervals.icu calendar delivery behind `ENABLE_INTERVALS_CONNECTOR`.

**What is NOT built yet is specified below.** Acceptance for every item: deterministic tests for the math, an honest-data review (no invented values, uncertainty stated), and a live probe of the athlete-visible surface.

---

## P1 — Best-in-class race prediction ("AdvanzedRacing 2")

### 1.1 Weather-adjusted pacing per leg, not just per race
- Today: temperature, humidity and WBGT adjust the whole race; wind is a loop-course mean. **Build:** pull the Open-Meteo hourly forecast for the race start hour and *each leg's expected time window* (swim 20 min → bike 3 h → run 90 min means bike sees the +2h forecast row). Feed per-hour wind speed AND direction into the segment solver.
- Direction-aware wind: we have the race's lat/lng and the GPX track bearing per segment. Compute the relative wind angle (head/cross/tail component) per segment instead of the 50% loop heuristic. This is the single largest accuracy upgrade available (a 12–20 mph wind can shift a bike split ~20 minutes — the gap between our prediction and reality today).
- Acceptance: same course file, two forecasts (calm vs 30 km/h gusting) produce ≥5% split difference in the bike table; documented formula; uncertainty band derived from gust variance as now.

### 1.2 Per-athlete model calibration (close the forecast loop)
- We already store RaceForecastSnapshot (pre-race prediction) and result minutes. **Build:** per-athlete error tracking — after each race, compute error% by leg and by weather condition, and store a personal bias factor (e.g. "this athlete's bike predictions run 4% optimistic in heat") applied to future forecasts. Show it in the forecast page as "personalized after N races; currently ±X%".
- Cold-start default: population bias from the snapshot table across all athletes.
- Acceptance: after ≥2 recorded results, the forecast page shows a personal calibration line; predictions without results keep the population band.

### 1.3 Power/pacing file export from the segment table
- The pacing table is currently display-only. **Build:** export the bike segment table as a FIT workout (or Intervals structured event) so the *race pacing plan itself* rides on the watch — target watts per segment, with the gust-band as a stated uncertainty. This is the Best-Bike-Split killer feature and we already compute 90% of it.
- Acceptance: a pacing plan from a GPX race round-trips through our FIT/Intervals paths with per-segment power targets preserved.

### 1.4 Course-aware run legs
- Run pacing currently integrates grade per sample (fixed). Add: terrain factor per segment from the GPX (surface is unknown, but grade variance is a proxy: rolling = harder), plus the altitude factor at venue elevation (already computed race-wide — apply per segment for mountain courses).

---

## P2 — Science-based training upgrades

### 2.1 Asymmetric guardrails (adopt from Domestique, cite as engineering policy)
- Subjective/device data may only **lower** intensity or volume, never raise it. Today a great HRV can upgrade a session; make positive upgrades require a completed benchmark or coach action, while negative signals act automatically. This is our strongest injury-prevention stance and is defensible in review.
- Add the ACWR (acute:chronic workload ratio 0.8–1.3 sweet spot, Gabbett) guardrail: block plan generation that would push ACWR above 1.3, and flag it in the why-line.

### 2.2 eFTP / threshold drift recalibration
- From stored completed activities with power: rolling best 20-min power → eFTP suggestion (TrainerRoad-style), surfaced as an *opt-in* anchor update (same consent pattern as the 5K→threshold derive). HR-based fallback: rolling resting-HR/HRV trend can flag "thresholds likely stale" in the dashboard.
- Acceptance: suggestion only fires with ≥5 quality power samples in 90 days; applying it is explicit, audited, and reversible.

### 2.3 2026 ACSM concurrent-training position stand
- Integrate the ACSM 2026 position stand (concurrent strength + endurance) into the strength engine's interference guidance: separation hours, ordering, and per-goal (endurance-dominant vs strength-dominant) recommendations. Cite it in the why-line and the science library. This also upgrades the weightlifting/strength depth flagged as shallow.

### 2.4 Recovery: HRV-guided down-regulation detail
- Keep the readiness engine, but add: (a) post-hard-session HRV suppression tracking (expected 24–48h dip — flag *abnormal* non-recovery after 72h), (b) travel/heat/sleep-debt context chips on the dashboard so athletes see *why* a verdict happened, (c) the breathing/downshift protocol delivered post-workout via Telegram when the session was Z4+.

---

## P3 — Fuel (already strong — extend to delivery and race day)

### 3.1 Race-day fueling plan on the segment table
- We compute race fuel (kcal/h, carbs, sodium) — put it **into the pacing table export**: "at km 40 take 30g gel" checkpoints derived from segment cumulative time. GPS-free fueling alarms: convert to watch alerts (Garmin FIT supports time-based alerts; Intervals event description carries the schedule).
- Acceptance: race fuel checkpoints appear in the exported file/description at the correct cumulative times.

### 3.2 Fuel adherence logging
- After-workout form: "did you fuel as planned? g/h actual" (free number, optional). Store with the workout; the fueling engine's gut-training progression reads adherence (this is the input the gut-training plan is missing).

---

## P4 — Coach approach: KCoach + dashboard

### 4.1 Conversation memory and follow-ups
- The grounded chat is stateless per question. **Build:** store the last N Q&A pairs per athlete (athlete-scoped), pass them as conversation turns so follow-ups ("what about Sunday?") work. Respect the no-mutation doctrine and the same consent gates.
- Weekly coach digest in chat: "ask me about your week" produces a structured review (adherence, load, PRs, race countdown) from real data — reuse the weekly-review generator.

### 4.2 Dashboard: athlete mission control upgrades
- Add the freshness/status chips everywhere data appears (synced-now/pending/stale — already in check-in API, surface in dashboard cards).
- Race-day projection mini-chart (CTL/TSB to race) on the dashboard when a race is <90 days out — data exists, needs the sparkline.
- Recovery-trend view: 14-day HRV/RHR/sleep sparklines with baseline band — data exists in DailyMetrics.

### 4.3 Coach (multi-athlete) views
- Per-athlete one-line health (green/amber/red — sync-health API exists) + "needs attention" queue: stale sync, missed check-ins, red verdicts 3 days running, race <14 days without confirmed goal time. This is what makes a coach of 10 athletes effective.

---

## P5 — After-workout analysis loop

### 5.1 Post-workout report v2
- Keep the deterministic activity report; add: (a) **fuel adherence vs plan** (once 3.2 exists), (b) **HR-domain check** — avg HR zone vs prescribed zone with an honest "we only store averages" caveat, (c) **suggested tomorrow adjustment reason** one-liner (the engine already computes this — surface it).
- Regeneration on corrections and separation of computation from notification are already fixed — keep that property.

### 5.2 Benchmark decay notices
- When an anchor (FTP/LTHR/5K) is >90 days old, the dashboard suggests a retest via the Labs battery. Anchors have timestamps; this is a display feature.

---

## P6 — Delivery: manual-first, then alternatives (the "media" question)

### 6.1 Manual-first excellence (current reality)
- FIT file must be **complete and correct for each sport** (dot's work: swim/strength/HYROX/brick). Remaining: verify a real watch import (Garmin via USB `GARMIN/NewFiles`, and the same file on a COROS/Wahoo device). Record the acceptance per device model in docs — this is the evidence that ends the "verified delivery" dispute.
- The share-sheet flow (mobile) needs the same per-device acceptance (share → Files → Garmin app passthrough varies by phone OS).

### 6.2 Alternative automatic paths (evaluate, then pick ONE)
1. **Intervals.icu OAuth** (applied — pending approval). Priority 1: keeps our architecture, free, athlete-consented. Finish the structured-run format when their docs cover it.
2. **Terra workout-push API** (verified to exist, Sep 2026 docs): server-side push to Garmin/COROS/Wahoo/Suunto/Zepp/Huawei/TP/Hevy. Paid per-account. Evaluate cost + ToS + athlete consent model; if Intervals OAuth stalls, this is the fallback for *automatic* delivery.
3. **.FIT email/Telegram attachment on approve** (manual but zero-gate): when an athlete approves a session, the .FIT arrives as an email attachment / Telegram file — one tap to save, then USB or app import. Cheap, no new dependencies.
- **Do NOT** route Strava through a third-party intermediary (June-2026 Strava policy) and do not depend on Strava for anything delivery-related.

### 6.3 Graphics in every channel (already partially built)
- Keep: red effort-shape PNG in Telegram/email, /daily session map, sparkline. **Add:** the pacing table as a compact PNG in the race-day Telegram/email (race brief already sends prose; the table graphic closes it), and the workout graphic on the workout-approval email.

---

## Delivery order and effort (suggested)

| Order | Item | Effort | Depends on |
|---|---|---|---|
| 1 | 6.3 graphics to Telegram/email (pacing table PNG) | ~0.5d | none |
| 2 | 6.1 per-device FIT acceptance run (real watches) | ~1d + devices | physical devices |
| 3 | 1.3 pacing-table → FIT/Intervals export | ~1d | 1.2's GPX (exists) |
| 4 | 1.1 per-hour weather + direction-aware wind | ~2d | Open-Meteo (already used) |
| 5 | 2.1 asymmetric guardrails + ACWR | ~1d | none |
| 6 | 4.1 chat memory + weekly digest | ~1d | none |
| 7 | 1.2 per-athlete calibration | ~1–2d | recorded results |
| 8 | 2.2 eFTP drift suggestion | ~1d | power data present |
| 9 | 3.1–3.2 race fuel checkpoints + adherence | ~1–2d | 1.3 |
| 10 | 2.3 ACSM 2026 integration | ~0.5d + review | none |
| 11 | 4.2–4.3 dashboard/coach views | ~2d | none |
| 12 | 6.2 Terra evaluation spike | ~0.5d | business decision |

## Standing constraints (repeat, they bind)
- Never invent athlete data; missing → `—` with reason. Never claim device delivery without receipt. Estimates labeled as estimates. Chat never mutates training. Every export resolves through the shared safety-gated prescription. Uncertainty bands stay visible.
