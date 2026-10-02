# AGENTS.md — Mandatory Rules for ALL Agents in This Repository

These rules are **always-on** for every agent, reviewer, or automation working
in this repository (Codex, Claude, GLM, Gemini CLI, OpenCode, CI bots). They
compound the installed skill sets (`.agents/skills/` — Vercel React suite,
Addy Osmani web-quality suite, CodeRabbit review suite). If a task conflicts
with a rule below, the rule wins; propose an exception in writing first.

---

## 1. GitHub Open Code Review & Verification (CodeRabbit suite — mandatory)

1. **Pre-commit diff check.** Before every commit: re-read the full diff.
   Every changed file must compile (`npx tsc --noEmit`) and every intended
   edit must be VERIFIED IN SOURCE (grep for the new symbol) — a write that
   "succeeded" is not evidence.
2. **Zero secret exposure.** Never commit keys, tokens, passwords, session
   cookies, or real hostnames/project refs in examples (use
   `YOUR_PROJECT_REF`-style placeholders). If a secret appears in chat or
   diffs, rotate it and note the rotation. `.env*` files are gitignored —
   never stage them.
3. **Security audits on every review.** Check for: injection (SQL/JS),
   missing auth on new routes (trainingAccess/getCurrentUser), cross-athlete
   data leaks (tenant isolation), unsafe JSON parsing of client input, and
   fabricated success states (a 200 must mean verified completion, never
   "probably happened").
4. **Build gates.** `npm run build` must pass before deploy; `npm test` must
   pass (currently 201). A green suite does NOT substitute for acceptance
   tests of provider/device flows — label those honestly.
5. **Clean commits.** One logical change per commit; messages describe the
   behavior change, not the effort. Never `git add -A` blindly (cookie jars,
   env files). Never force-push shared branches.

## 2. Modern Web Quality & React Best Practices (Vercel + Osmani suites — mandatory)

1. **Waterfall elimination.** No sequential fetches that could be parallel
   (`Promise.all` by default); no render-blocking third-party scripts.
2. **Bundle optimization.** Server Components by default; `"use client"` only
   for real interactivity; dynamic `import()` for heavy libraries; no
   full-library imports (e.g. `import * as` from icon packs).
3. **Technical SEO.** Every public route indexable: canonical URLs with
   trailing-slash consistency, `/sitemap.xml` and `/robots.txt` kept current
   (Jev audits them), meta titles/descriptions present, no app pages leaked
   into the sitemap.
4. **Accessibility (WCAG 2.2).** Keyboard-reachable interactions, visible
   focus, labeled inputs, `role="alert"`/`role="status"` for async feedback,
   color never the sole signal, contrast ≥ 4.5:1.
5. **Core Web Vitals.** LCP: hero content server-rendered, images sized +
   `next/image`; INP: no long tasks on interaction paths; CLS: explicit
   dimensions on media, no layout-shifting late loads.
6. **Honest-data doctrine (project-specific, non-negotiable).** Never invent
   athlete data, never claim device delivery without receipt evidence, never
   label estimates as measurements. Missing values render as `—` with a
   reason.

## 3. Verification ladder (what "done" means)

Local type-check + tests → build → deploy → LIVE probe of the changed
surface (curl/browser with real session) → report. Skipping a rung requires
an explicit reason in the report. The production URL is
`https://jasmiamimethod.fit`; deploys via `npx vercel --prod` from
`science-v2-shadow`; transient "Not authorized" → retry once after 10s.
