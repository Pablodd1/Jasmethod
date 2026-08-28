# JasMiamiMethod — Product Brief for Audio Overview

## What it is
JasMiamiMethod is a science-backed triathlon and endurance coaching app for Miami athletes. Every recommendation is grounded in peer-reviewed sports medicine research (post-2000 evidence base). Stack: Next.js 14, TypeScript, Prisma, Supabase PostgreSQL, Gemini AI coach named JASAI. Multi-user with admin dashboard, 5-language support (English, Spanish, Haitian Creole, French, Russian).

## The core loop
1. Baseline testing: field-test labs establish LTHR, FTP, VO2max, run and swim pace bases. Blood panels and DNA analysis modules layer on individualization.
2. Periodized plan generation: a rule-based engine builds the full training block from the athlete's profile — goal race, weekly hours, experience, zones. No data entered means a science-based standard plan.
3. Daily 30-second check-in: sleep quality, soreness, energy, motivation, stress, morning weight, resting heart rate, plus sick and menstrual flags. Voice check-in supported.
4. Everything the athlete types is analyzed, never just stored: resting HR versus 7-day baseline (plus 6 beats knocks readiness down), weight trends flag hydration or fueling issues (up over 1 percent overhydration, down over 1.5 percent under-fueling), HRV trends adjust tomorrow's session. The daily readiness verdict rewrites today's workout intensity.
5. Five PM Telegram message delivers tomorrow's full session detail.

## The workout system
Every session is structured for the athlete, five blocks:
- WARM-UP: sport-specific (run drills, bike openers, swim technique set, strength dynamic warm-up)
- MAIN SET: a specialist-coach prescription per discipline and session type. Run intervals: 6 by 800m at vVO2max with 400m jog recovery, Billat 2001. Bike threshold: 3 by 10 minutes at 91 to 105 percent FTP. Swim threshold: 4 to 8 by 100m at T-pace, stop if pace drops more than 3 seconds. Strength: heavy compound lifts 3 to 5 by 5-8, Rønnestad 2014. Brick: ride then immediately run — legs-on-stilts is the skill being trained.
- COOL-DOWN, breathing protocol (box, 4-7-8, physiological sigh, extended exhale), and a STUDY line: the evidence behind the session.
- Zones explained in plain English: Z4 threshold equals 94 to 99 percent of LTHR, race-effort hard.

## The calendar
Click any day: full session cards, done button, and a Move button. Reschedule by date and time, mark indoor, or enter expected temperature for live heat guidance (extreme heat: 25 percent volume cut, pace by feel not target, ice slurry plus 750ml per hour fluids — Ely 2007, Casa 2000). Day off means 20 minutes zone 1 plus breathing, never nothing.

## Performance analytics
Plain-English training load: TSS scores one workout, CTL is 42-day fitness (engine size), ATL is 7-day fatigue, TSB is form (fitness minus fatigue; positive equals race-ready). The PMC chart builds automatically as workouts are completed. Execution score tracks plan compliance over 7 days. Race predictions estimate finish time from current fitness.

## Recovery and lifestyle modules
Sleep science (tracker sync via Whoop, Oura, Apple Health), nutrition and hydration logging with electrolyte math, blood panel interpretation, DNA analysis for responders (ACTN3, ACE variants), HRV and recovery dashboard.

## Connectors
Strava OAuth (live), Garmin Connect OAuth, Google Calendar read-only so the coach sees meeting conflicts and suggests session moves, manual CSV/XML imports. Admin dashboard lets the coach see every athlete's readiness, compliance, and load.

## Reminders and engagement
Daily check-in nudge, 5 PM plan delivery on Telegram, morning quiz, stimulation engine for habit adherence. Streaks and a completion-first design.

## Positioning
The go-to Miami athlete app: peer-reviewed science, baselines, individualized natural enhancement. The user is the coach of their own data — JASAI explains what the numbers mean and what to do about them. Free group training sessions weekly as the funnel. Demo accounts: Jasmel, Andres, Jando, password demo1234.
