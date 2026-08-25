# JasMiamiMethod 🏊🚴🏃

**The science-backed triathlon method.** Personalized training based on post-2000 sports medicine research: daily training, sleep, recovery, HRV, blood panels, DNA analysis, nutrition, hydration, and periodized race plans — one coach, every ingredient.

## Stack

- **Next.js 14 (App Router)** + TypeScript + Tailwind CSS
- **Prisma + SQLite** locally (`DATABASE_URL`-switchable to Postgres/Supabase for prod)
- **Auth**: email + password, hashed sessions (SHA-256 scrypt-style), athlete/coach roles
- **Email**: SMTP via nodemailer (graceful dev fallback)
- **Deploy target**: Vercel (zero-management, as preferred)

## Run it

```bash
cd ~/JasMiamiMethod
npm install
npx prisma db push && npx prisma db seed
npm run dev          # → http://localhost:3000
```

Demo account: `demo@jasmiamimethod.com` / `demo1234` (has profile, zones, metrics, plan)

## Features

| Area | What it does |
|---|---|
| **Training plans** | Periodized Base → Build → Peak → Taper generator. Sprint → Full Ironman, beginner → pro. Session-by-session swim/bike/run/strength/brick/recovery with zone targets. |
| **Zones** | 7-zone HR model anchored on LTHR (Friel), power zones on FTP (Coggan), pace zones. VO2max auto-estimated via Jurca 2005 regression; HRmax via Tanaka 2001. |
| **HRV readiness** | Morning RMSSD vs 7-day baseline → readiness score + day-specific advice (Buchheit 2014, Plews 2013). |
| **Sleep** | Logging + 30-day trends, quality, deep sleep. Coach notes (Mah 2011 sleep extension). |
| **Blood panels** | Any marker with reference ranges + athlete-specific interpretation (ferritin ≥50-60, CK, vitamin D, testosterone…). |
| **DNA analysis** | Upload raw 23andMe/Ancestry file → parses SNPs → analyzes 6 performance traits (ACTN3, ACE, COMT, PPARGC1A, NOS3, ADRB2) with impact flags + honest evidence caveats. |
| **Connectors** | Strava OAuth (key-ready), Garmin TCX upload, Apple Health export.xml upload, Whoop cycle CSV upload, Oura API (key-ready). All merge into one timeline with dedupe. |
| **Nutrition & hydration** | Food logging with macros, water tracking vs 3L target, fueling guidelines (60-90g carbs/h, 1.2-1.6 g/kg protein, sodium). |
| **Calendar** | Month view with planned sessions, completed workouts, events; add/edit; active-plan overview. |
| **Motivation** | Daily rotating quote + coach/science/tough/gentle styles; daily email digest endpoint. |
| **Email** | Welcome email on signup + daily motivation digest (SMTP-configurable). |

## Science references baked in

Seiler & Tønnessen 2009 (80/20), Billat 2001 (vVO2max), Allen & Coggan (TSS/FTP), Friel (7-zone LTHR), Foster 1998 (sRPE), Buchheit 2014 + Plews 2013 (HRV-guided), Tanaka 2001 (HRmax), Jurca 2005 (VO2max non-exercise), Yang 2003 + Montgomery 1998 + Bouchard 2011 (genomics), Rønnestad & Mujika 2014 (strength), Jeukendrup 2011/2014 (carbs), Thomas 2016 (ACSM nutrition), Mah 2011 (sleep), Fullagar 2015 (sleep review), Ryan & Deci 2000 + Gollwitzer 1999 (psychology), Peeling 2008 + Ross 2016 + Brutsaert 2003 (hematology).

## API surface (all auth-scoped)

`/api/auth/{signup,login,logout,me}` · `/api/profile` · `/api/plan` + `/api/plan/generate` · `/api/workouts` · `/api/metrics` · `/api/sleep` · `/api/blood` · `/api/dna` · `/api/nutrition` · `/api/calendar` · `/api/connectors` + `/api/connectors/strava/callback` · `/api/import` (tcx/applehealth/whoop) · `/api/email/digest`

## To go live (when ready)

1. Create a Supabase project (or Vercel marketplace install — one browser click for terms).
2. Set `DATABASE_URL` to the Postgres connection string; swap `provider = "sqlite"` → `"postgresql"` in `prisma/schema.prisma`, then `prisma db push`.
3. Set `SMTP_*` env vars for real email (e.g. Gmail app password).
4. Add `STRAVA_CLIENT_ID/SECRET` and `OURA_CLIENT_ID/SECRET` to activate those OAuth flows.
5. `vercel --prod` — Vercel CLI is already authenticated on this machine.
