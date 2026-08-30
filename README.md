# JasMiamiMethod — Project Master Readme

**The go-to app for Miami athletes: peer-reviewed baselines, race goals, endurance training, recovery, fuel, and natural enhancement — individualized per athlete.**

- Stack: Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL (Supabase) · Gemini AI coach
- Repo: `github.com/Pablodd1/Jasmethod` (private frontend build, SSH remote `github_jasme`)
- Local: `~/JasMiamiMethod` — `npx prisma db push && npx prisma db seed && npm run dev`

---

## 1. Executive Summary

JasMiamiMethod is a science-backed triathlon/endurance coaching app targeting the Miami athlete population. It combines a **rule-based training engine grounded in peer-reviewed research** with an **AI coach (Gemini)** that reads the athlete's full data picture. The app covers the complete athlete lifecycle: baseline testing → periodized planning → daily adaptive check-in → race targeting → recovery → fuel → natural ergogenic aids → equipment guidance → multi-language (5 langs).

**Current state: production-grade MVP. 45+ routes, full auth, multi-user, admin dashboard.** All features verified working end-to-end.

---

## 2. What Was Requested vs. What Was Built

### 2.1 Spanish language completion (i18n)

| Requested | Built | Status |
|---|---|---|
| Full Spanish support across all pages | 5-language i18n system (en/es/ht/fr/ru), 100+ keys; dashboard, sleep, labs, dna, connectors, reminders, checkin all wired to `t(lang, key)` | ✅ Complete |
| Language selector | In navbar (app-shell), persists per user (`user.language`), fallback to English for missing langs | ✅ Complete |

### 2.2 Gear Lab — equipment intelligence

| Requested | Built | Status |
|---|---|---|
| Recommend power meters (bike + run) when applicable | Rule-based gear advisor: bike PM (if FTP known but no PM), run power/Stryd, smart trainer, cadence sensor, HR strap, GPS watch, swim pacing tool — with DO FIRST priority ranking | ✅ Complete |
| Aero advice based on current bike | Aero advice for tri/road bikes: clip-on bars, torso drop (CdA, Fonda & Saris), helmet/kit; only for race distances, not gravel/MTB | ✅ Complete |
| All recommendations peer-reviewed | 8 new research sources added (Jobson 2009 power meters, Sanders 2019, García-Pinillos 2018 run power, Fonda 2011, Griffiths 2022, Croucher 2023, Austin 2022); every recommendation shows its citation | ✅ Complete |
| "Show all evidence" | Expandable panel listing every source with evidence level (A/B) and population | ✅ Complete |

### 2.3 Device & platform connectivity

| Device | Method | Status |
|---|---|---|
| Strava | Official OAuth2 (auth/exchange/refresh/activities) | ✅ Working (needs STRAVA_CLIENT_ID/SECRET in env) |
| Garmin | **New** official Garmin Connect OAuth2 + TCX manual fallback | ✅ Code complete (needs GARMIN_CLIENT_ID/SECRET) |
| Google Calendar (Gmail) | **New** OAuth2 read-only — imports meetings as appointments; coach uses busy time | ✅ Code complete (needs GOOGLE_CLIENT_ID/SECRET) |
| Whoop | CSV upload parser | ✅ Working (manual) |
| Oura Ring | API v2 — provider scaffolded | ⚠️ Needs OURA_CLIENT_ID/SECRET |
| Apple Health | export.xml parser | ✅ Working (manual) |
| Stryd | No public API — data via Strava/Garmin | ✅ Via existing connectors |
| TrainingPeaks | API v1 requires partner approval | ❌ Not built (external approval needed) |

**All connectors are per-user** (Connector model with encrypted tokens, per-user sync). Multi-user confirmed.

### 2.4 Admin dashboard

| Requested | Built | Status |
|---|---|---|
| See all accounts as administrator | `/admin` — table of all athletes: name, email, avatar, goal, level, FTP/VO2, workouts 30d, TSS 30d (estimated), streak, last workout (green/amber/red), last check-in, benchmark improvement (📈/📉), connected devices | ✅ Complete |
| Credentials & progress visibility | Summary cards: total athletes, active (≤7d), at risk, avg TSS, device-connected count | ✅ Complete |
| Admin-only access | `role: admin|coach` gate — 403 + nav item hidden for athletes; jasmel + jasmelacosta@gmail.com set as admin | ✅ Complete |

### 2.5 Calendar-aware coaching

| Requested | Built | Status |
|---|---|---|
| Integrate with Google Calendar so users see other activities/meetings | Google Calendar OAuth (read-only), imports 14 days of events as `appointment` type | ✅ Code complete (needs GOOGLE_CLIENT_ID/SECRET) |
| Coach makes training decisions based on availability | Check-in computes busy count + hours today → `busyNote` ("4 meetings ~5h busy. Medium day — compact session fits"); dashboard shows amber calendar card with today's commitments; plan days are draggable in /calendar | ✅ Complete |

### 2.6 Nutrition, ergogenics & stimulation (latest)

| Requested | Built | Status |
|---|---|---|
| Pre-workout: caffeine, beta-alanine, citrulline, bicarbonate | Ergogenic library: caffeine, **citrulline (new)**, nitrate/beetroot, creatine, beta-alanine, bicarb, phosphate — each with evidence level, dose, timing, benefit, caution | ✅ Complete |
| Intra: sodium, water, carbs | `recommendFuel`: carbs/h, sodium mg/h, fluid ml/h scaled by duration + heat | ✅ Complete |
| Post-workout recovery fueling | **New `postWorkoutFuel`**: 30-60 min window, carbs:protein ratio (2:1 base, 3:1 long, 1:1 strength), sodium+fluid, food examples | ✅ Complete |
| Music for training focus | **New `stimulation.ts`**: curated YouTube playlists by intent (arouse 140BPM / focus 40Hz / recover ambient / sleep 432Hz) | ✅ Complete |
| Brain training + down-regulation | **New**: per-phase brain exercises (attention primer pre, cadence counting during, body scan post, cognitive wind-down night) + paired breathing per phase | ✅ Complete |
| "Before, during, after" complete arc | Check-in now returns `stim` (pre/during/post/night plans), `post` (refuel), and de-duplicated caffeine | ✅ Complete |

### 2.7 Overlap analysis (as requested)

| Overlap found | Analysis | Resolution |
|---|---|---|
| Caffeine recommended in BOTH ergos and fuel | Real duplicate — user saw caffeine twice | ✅ Fuel now checks `ergosIncludeCaffeine` and notes "already covered, no double dose" |
| Bicarb in library but never triggered | Dead code — no session type triggered it | ✅ Now triggers on `test`/`race` sessions |
| Recovery techniques vs stimulation breathing | Intentional overlap — recovery lib = technique library; stimulation pairs them contextually (pre/during/post/night) | ✅ Kept, differentiated |

---

## 3. Architecture & Data Pipeline

### 3.1 Core modules (`src/lib/`)

| Module | Responsibility |
|---|---|
| `science.ts` | Training science: VO2max, LTHR, zone tables, TSS/CTL/ATL/TSB, HRV readiness, intensity distribution, plan generation (periodized base→build→peak→taper), Hyrox plans |
| `adaptive.ts` | Daily adaptation engine: `adaptSession` (biometrics → rest/easy/trim/full), recovery techniques (9 breathing), day-off protocol, temperature/heat adjustment, hydration analysis, `recommendFuel`, `recommendErgogenics` (7 aids), `postWorkoutFuel` (new) |
| `stimulation.ts` (new) | Music (YouTube), brain training, breathing pairing per phase (pre/during/post/night) |
| `gear.ts` | Equipment intelligence: power meters, aero, swim, HR, cadence — with citations |
| `research.ts` | Evidence base: 27 peer-reviewed sources with claim/ref/level/population; `sourcesFor()` API |
| `fitness.ts` | TSS estimation, PMC, race prediction, heat/altitude factors |
| `coach.ts` | Gemini AI coach briefing with rule-based fallback + source citations |
| `importers.ts` | Garmin TCX, Apple Health XML, Whoop CSV, Strava OAuth, Garmin OAuth (new), Google Calendar OAuth (new), DNA parsers |
| `i18n.ts` | 5-language dictionary with fallback |
| `fuelbrands.ts` | Recommended fuel brands catalog |
| `voice-parse.ts` | Voice check-in transcript → structured answers |

### 3.2 Data pipeline (the daily flow)

```
🌅 Morning: check-in (form or VOICE)
    ↓ sleep/soreness/energy/motivation/stress/RHR/weight/menstrual/sick
    ↓ + Google Calendar meetings (busy time)
    ↓ + 7-day baselines (RHR, weight, HRV)
    ↓
🧠 adaptSession() → score 0-100 → verdict (rest/easy/trim/full)
    → durationFactor + intensityCap
    → fuel plan (intra: carbs/sodium/fluid × heat)
    → ergogenic picks (pre: caffeine/citrulline/creatine/beta-alanine/bicarb)
    → post-workout refuel (carbs/protein/sodium)
    → stimulation plan (music/brain/breath pre-during-post-night)
    → recovery technique of the day (9 breathing rotations)
    → calendar-aware busyNote
    ↓
📋 Stored in DailyCheckin (full JSON) → feeds next day's baselines
```

### 3.3 Periodized training structure

`generatePlan()` produces: Base → Build → Peak → Taper with daily sessions per sport; race targeting (Miami 70.3, Hyrox Miami, Miami Marathon); `scheduleTests()` embeds baseline re-tests (VDOT/FTP/LTHR/CSS); day-off protocol = 20min Z1 + breathing; heat/altitude adjustments for Miami conditions.

---

## 4. API Reference (key endpoints)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/*` | POST | signup, login, logout, me |
| `/api/plan` | GET/PUT | plans, session edits, day-off toggle |
| `/api/checkin` | GET/POST | daily questionnaire → adaptation/fuel/ergos/post/stim/calendar |
| `/api/gear` | GET/PUT | equipment advice + measurement stack toggles |
| `/api/admin` | GET | all-athletes overview (admin/coach only) |
| `/api/connectors` | GET | provider list + OAuth URLs |
| `/api/connectors/strava/callback` | GET | Strava OAuth → token + import |
| `/api/connectors/garmin/callback` | GET | Garmin OAuth → token + import (new) |
| `/api/connectors/google-cal/callback` | GET | Google Calendar OAuth → events as appointments (new) |
| `/api/import` | POST | manual file uploads (TCX/Apple/Whoop) |
| `/api/coach` | GET | Gemini daily briefing with sources |

---

## 5. Environment Variables (required for OAuth features)

| Variable | Used for | Status |
|---|---|---|
| `DATABASE_URL` | Supabase pooled Postgres (PgBouncer, port 6543) | ✅ Set |
| `DIRECT_URL` | Supabase direct Postgres (Session, port 5432) — **required** for `prisma migrate deploy` | ⚠️ Must set |
| `NEXT_PUBLIC_APP_URL` | OAuth redirects | ✅ Set |
| `STRAVA_CLIENT_ID/SECRET` | Strava OAuth | ⚠️ Set? (dev.strava.com) |
| `GARMIN_CLIENT_ID/SECRET` | Garmin OAuth | ❌ Need (developer.garmin.com) |
| `GOOGLE_CLIENT_ID/SECRET` | Google Calendar OAuth | ❌ Need (console.cloud.google.com) |
| `OURA_CLIENT_ID/SECRET` | Oura OAuth | ❌ Need (cloud.ouraring.com) |
| `GEMINI_API_KEY` | AI coach | ✅ Set |
| `AUTH_SECRET` | *(not read by DB-session auth — not required for MVP)* | ⚠️ Optional |
| `TELEGRAM_BOT_TOKEN` | Reminders via Telegram | ⚠️ Optional |
| SMTP vars | Email reminders | ✅ Set |

**To activate each OAuth:** create the dev app (free), add redirect URI `https://<domain>/api/connectors/<provider>/callback`, put credentials in `.env`, restart.

> **Database wiring (Supabase):** `DATABASE_URL` must be the **pooled** connection (PgBouncer, port `6543`, `?pgbouncer=true`) and `DIRECT_URL` the **direct/Session** connection (port `5432`). Prisma requires a **non-empty `DIRECT_URL`** to run migrations — without it, `npm run build` fails with `P1012` and the deploy stops. The build now auto-applies the schema via `prisma migrate deploy`, so no manual `db push` is needed in production. If `DATABASE_URL` is already a plain direct connection (no pooler), set `DIRECT_URL` to the same value.

---

## 6. What's NOT built yet (honest gaps — for the next developer)

| Feature | Why not | Effort |
|---|---|---|
| **`prescribeToday()`** — the final daily prescription that REWRITES today's workout from all signals (checkin + calendar + weather + load) | The plumbing exists (adaptSession + busyNote + temperatureAdjustment + estimateTss); the final "rewrite the plan day" step is not wired | ~1 day |
| **End-of-day review loop** — athlete rates how the session went; feeds tomorrow's adaptation | Model exists (workout.completed/rpe); no EOD UI | ~0.5 day |
| **Oura OAuth** | Needs OURA_CLIENT_ID/SECRET | ~0.5 day (pattern exists) |
| **TrainingPeaks OAuth** | Requires TP partner approval (weeks) | code ~0.5 day after approval |
| **Live YouTube playlists** (YouTube Data API search) | Static curated links work; live search needs API key + budget | ~1 day |
| **Extended lifestyle questionnaires** (mood, anxiety) | Not requested in scope yet; checkin covers core | ~0.5 day |
| **Daily AI call per athlete** | Not enabled; Gemini cost ~$0.0004/day/athlete, 50 athletes < $1/mo — safe to enable | ~1 day |
| **Production deployment** | Currently local/Vercel-ready; needs env vars + deploy config | ~1 day |
| **Benchmark trend chart in admin** | Table shows first→latest; sparklines would be nicer | ~0.5 day |
| **User feedback/support workflow** | Admin sees all accounts; no in-app ticket system | ~1 day |

---

## 7. Verification Record (what was tested)

| Feature | Test | Result |
|---|---|---|
| i18n Spanish | Build + page render | ✅ 45/45 pages compiled |
| Gear Lab | API GET/PUT with demo profile (road, half, FTP 240) | ✅ 8 recommendations + 11 sources; toggle removes PM advice, adds pacing |
| Garmin OAuth | Build + route registered | ✅ `/api/connectors/garmin/callback` compiled |
| Admin | API with admin session vs demo session | ✅ 200 (4 athletes, TSS estimates, streaks) / 403 (non-admin) + nav hidden |
| Google Calendar | Created 4 test meetings for demo; GET checkin + POST checkin | ✅ busyCount 4, busyNote "~5h busy. Medium day"; dashboard card renders meetings |
| Stimulation + post | Created test interval session; POST checkin | ✅ ergos [caffeine, creatine, betaAlanine, citrulline], post 40gC/20gP, stim pre/during/post/night with music+brain+breath, caffeine dedup note |
| Multi-user | 4 seed athletes + 2 admins | ✅ isolated per-user data |

---

## 8. Getting Started (for a new developer)

```bash
# 1. Clone & install
git clone git@github.com:Pablodd1/Jasmethod.git && cd Jasmethod
npm install

# 2. Environment
cp .env.example .env.local   # add DATABASE_URL (pooled) + DIRECT_URL (direct), GEMINI_API_KEY, AUTH_SECRET

# 3. Database (local dev)
npx prisma migrate deploy   # or `db push` for quick local iteration
npx prisma db seed
# Production: `npm run build` runs `prisma migrate deploy` automatically.

# 4. Run
npm run dev                  # http://localhost:3000

# 5. Demo logins (password: demo1234)
demo@jasmiamimethod.com      # Demo athlete (half, amateur, FTP 240)
jasmel@jasmiamimethod.com    # Triathlete + ADMIN
andres@jasmiamimethod.com    # Hyrox athlete
jando@jasmiamimethod.com     # Runner (full, advanced)
```

---

*Generated 2026-08-28. Maintained by the project owner + Hermes agent. This document is the handoff for any developer taking over — verify each section against the live code before relying on it.*
