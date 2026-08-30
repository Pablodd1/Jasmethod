# JasMiamiMethod — Deployment & Credentials Ledger

> Maintained by the project owner + AI developer. This file is the single source of
> truth for **where every credential lives** and **what steps are needed to go live**.
> ⚠️ Real secret values are NEVER committed to git — they live in the deploy platform's
> secret store (or, for local dev only, in the gitignored `.env`). This ledger records
> **names, locations, and instructions**, not raw passwords/keys.

---

## 1. Architecture

| Layer | Technology | Where |
|---|---|---|
| Frontend + API | Next.js 14 (App Router) | Vercel (or any Node host) |
| Database | PostgreSQL | **Supabase** (project ref `aycckjrkhgnwaggrrejp`) |
| ORM | Prisma 5.22 | `prisma/schema.prisma`, `prisma/migrations/0_init` |
| Auth | DB sessions (bcrypt + `jmm_session` cookie) | no external auth provider |
| AI coach | Google Gemini (optional) | falls back to rule-based |
| Email | SMTP (optional) | falls back to console logging |

---

## 2. Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (or GitHub → repo
Settings → Secrets and variables → Actions, if built via Actions).

| Variable | Required | Value / source |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase **Transaction pooler** URL (port `6543`, `?pgbouncer=true`) |
| `DIRECT_URL` | ✅ | Supabase **Direct** URL (port `5432`) — needed by `prisma migrate deploy` |
| `NEXT_PUBLIC_APP_URL` | ✅ | Deployed app URL, e.g. `https://<project>.vercel.app` |
| `CRON_SECRET` | ⚠️ cron only | Random string; protects `/api/cron/reminders` |
| `GEMINI_API_KEY` | optional | AI coach (rule-based fallback if empty) |
| `GEMINI_MODEL` | optional | default `gemini-3.6-flash` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | optional | email delivery (console fallback if empty) |
| `TELEGRAM_BOT_TOKEN` | optional | Telegram reminders |
| OAuth vars (Strava / Garmin / Google / Oura / Terra) | optional | device connectors — skip for MVP |

> Note: `AUTH_SECRET` appears in older docs but the DB-session auth code **does not read
> it**. It is not required for the MVP.

---

## 3. One-time database setup (Supabase)

```bash
# 1) Put the two URLs in .env (local, gitignored) or in the deploy env vars.
# 2) Apply schema (creates all tables):
npx prisma migrate deploy

# 3) Provision the two real MVP accounts:
npx tsx scripts/create-accounts.ts
```

`npm run build` already runs `prisma migrate deploy && prisma generate && next build`,
so a Vercel/GitHub deploy also auto-applies the schema — but only if `DIRECT_URL` is set
(otherwise the build fails with `P1012` by design).

---

## 4. Account ledger (MVP demo)

| Name | Email | Role | Password | Notes |
|---|---|---|---|---|
| Evgenia T | `evgenia@jasmiamimethod.com` | athlete | `123456789` | run + gym plan |
| Jasmel | `jasmel@jasmiamimethod.com` | **admin** | `12345679` | triathlon plan, sees Admin dashboard |

> ⚠️ These are **demo passwords**. Rotate them before any real users or real data are added.

Provisioning is idempotent (upserts) — safe to re-run: `npx tsx scripts/create-accounts.ts`.

---

## 5. Credential location map (the "memory")

| Credential | Where it lives | Committed to git? |
|---|---|---|
| Supabase project ref (`aycckjrkhgnwaggrrejp`) | this file / connection URL | ✅ (not secret) |
| Supabase DB password | **Supabase → Project Settings → Database → Reset password** (owner only) | ❌ never |
| `DATABASE_URL` / `DIRECT_URL` | Vercel (or GitHub Actions secrets) + local `.env` | ❌ never (`.env` is gitignored) |
| `CRON_SECRET` | Vercel/GitHub secret + local `.env` | ❌ never |
| `GEMINI_API_KEY`, SMTP creds, OAuth keys | Vercel/GitHub secrets | ❌ never |
| Demo account passwords | `scripts/create-accounts.ts` (hardcoded for MVP) | ⚠️ yes — rotate for prod |

---

## 6. Deploy checklist

- [ ] Supabase project created + DB password known
- [ ] `DATABASE_URL` (pooler, 6543) and `DIRECT_URL` (direct, 5432) set in deploy env
- [ ] `NEXT_PUBLIC_APP_URL` set to the deployed URL
- [ ] `npx prisma migrate deploy` runs clean (or build auto-applies)
- [ ] `npx tsx scripts/create-accounts.ts` provisions Evgenia + Jasmel
- [ ] Login as both accounts returns `200`
- [ ] (optional) `CRON_SECRET`, SMTP, `GEMINI_API_KEY` set
