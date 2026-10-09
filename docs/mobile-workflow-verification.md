# Mobile athlete workflow repair

Date: 9 October 2026. Base: `937ed39`.

## Reproduced problems

- Default onboarding ended after sex/weight, before goals, availability or evaluation. It marked onboarding complete but created no personalized plan.
- Saved experience/time answers were hidden on reload until eligibility confirmation; unsaved forms disappeared on navigation.
- Apple Health file weight was stored outside the explicit profile-review path.
- Training foregrounded a new generator rather than the saved cycle/month. Generated plan rows did not contain a persisted structured provisional prescription.
- Legacy Profile submitted every field and substituted defaults for missing answers, risking an unrelated edit changing a goal.
- Manual Garmin instructions did not clearly explain the website export, Files upload, format limits or difference between activity imports and workout delivery.

## Behavior repaired

Connections remain optional and first. One shared setup flow keeps server saves separate from recoverable per-tab drafts, restores saved answers and races, and offers 12-/24-week horizons. Imported file values require explicit review with source/date information; missing capacity is never inferred from an activity list.

A reviewed plan preview and explicit confirmation save the cycle and structured sessions. The saved cycle/month stays primary, and Today is always in primary navigation. Profile edits retain the active plan until a replacement is reviewed. Replacement archives earlier plans and preserves completed training; performed dates do not receive duplicate replacement sessions.

Future sessions are provisional and bounded by reported recent tolerated training. The four-week load/recovery pattern is an explicitly labeled coaching template, not a validated individual response model or outcome guarantee. Missing benchmarks leave targets open and prompt a comfortable non-maximal observation. A fresh daily check-in is required before actionable training/export. Urgent symptoms, illness and rest restrictions retain precedence.

New cycle movement sessions preserve their station identity and time budget without inventing fixed loads, repetitions or explosive work. Familiar/reviewed-only constraints propagate to preview, daily detail, email and calendar text. Private arbitrary notes are not copied into those exports.

Today provides large check-in/workout/feeling controls. Reported actual minutes, outcome and effort survive reload. English/Spanish core labels and automatic units are supported; existing explicit unit choices win. Storage/reference inputs keep their stated canonical units.

## Delivery and configuration

- Direct signed-in ICS snapshot: `/api/training/export?format=ics`. Access is athlete-scoped, unresolved sessions remain non-actionable, skipped/rest entries are excluded, and missing start times are explicit all-day placeholders. Reimport can duplicate events. This is not calendar synchronization or watch delivery.
- New Telegram pairing now fails clearly before creating a challenge when the configured bot username is missing/invalid. Existing verified-chat delivery is unaffected.
- Google sign-in and Calendar OAuth require separately registered callback URLs. A console `redirect_uri_mismatch` is not fixed or verified by local code tests. See `OWNER-SETUP.md`.
- Email and Telegram still require configured transport, per-athlete verified destination/consent and an operating worker/schedule. No live email, Telegram, Google or Garmin delivery was performed here.

## Local verification

The checked-in runners use only synthetic accounts and a disposable loopback PostgreSQL database, enforce database/egress guards, and clean up their fixture users. Browser testing uses Chromium mobile emulation at 390px and 412px, with touch and iPhone-/Android-like user agents. This is not physical iPhone Safari or Android-device certification.

- Final unit/provider-contract suite: 1,015/1,015 passed. TypeScript and lint passed (two pre-existing hook-dependency warnings); production build passed using the repository test-font mock to avoid external font access.
- Real PostgreSQL/HTTP acceptance: 4/4 passed. Covers new, imported-data and returning athletes, profile/goals reload, explicit preview/confirmation, private ICS, preserved history and narrowed future availability.
- Real Chromium mobile-emulation acceptance: 6/6 passed, with no browser JavaScript errors, blocked browser requests, acceptance egress or leftover fixture users. Covers interrupted drafts, connection skip, imported review, cycle persistence, actual feedback/reload, bottom-navigation Profile edits and automatic/explicit language-unit combinations.
- GitHub CI includes the guarded durable-workflow HTTP/DB acceptance script. Consult the PR checks for remote results on the exact commit.

Run `scripts/jmm-mobile-workflow-local-run.sh` in a clean checkout with the documented official PostgreSQL and browser prerequisites. It runs the DB and browser suites in one guarded disposable process environment. No production settings or credentials should be copied into it.

## Release and remaining limits

The default-only migration `20261009213200_language_unit_default` must accompany a later authorized release. It changes new-profile defaults to `auto`; it does not rewrite existing preferences. No production migration, merge or deployment is part of this repair.

- Real OAuth consent, provider imports, native calendar import and physical watch receipt remain unverified.
- Standalone lifting-only planning remains unavailable; supporting resistance work is not a validated Olympic-weightlifting program.
- Sprint technique and HYROX station competence require sport-specific review. Running threshold alone does not establish them.
- People with no recent tolerated training or unsupported safety circumstances still need an appropriate reviewed starting plan; the app does not invent a baseline or provide medical clearance.
- Legacy bibliography was corrected only for the specifically reviewed claims. The entire legacy catalog is not certified by this pass.
- Google Calendar synchronization still has its existing 07:00 fallback when no start time is supplied; the direct ICS fallback instead makes this unknown explicit. Reminder jobs currently run hourly, so a selected minute is not an exact delivery-time guarantee.
