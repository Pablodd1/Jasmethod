# JasMiamiMethod architecture — reviewed 2026-10-20

One Next.js 15 App Router application, TypeScript, PostgreSQL and Prisma 5.
DeepSeek supplies optional coaching text through existing consent/provenance boundaries.
The deterministic training engine remains authoritative; AI prose is not a measurement.

## Daily workflow

Account → optional device/file connection → review imported facts → goals and dated benchmarks →
daily safety/recovery/time check-in → canonical workout → explicit revision and approval →
supported export → actual outcome and optional measurements → subsequent coaching review.

Missing data, a saved preview, actual completion, approval, provider acceptance and device receipt
are separate states. Scheduling uses the athlete's timezone/preferences; a cron entry proves no delivery.

## Boundaries and invariants

- `access.ts`: authenticated owner or explicitly authorized coaching assignment; streams are owner-only.
- `effective-prescription.ts` / `canonical-session.ts`: one current prescription. Revisions go through the existing card writer with serializable transaction, expected revision, audit and approval invalidation.
- `activity-store.ts`: owner-scoped import idempotence and separate reconciliation decisions.
- `activity-stream-store.ts`: optional migration, default-off collection, per-upload consent, no GPS. Expired rows are excluded immediately; authenticated worker physically purges even with collection off.
- `strava-provenance.ts`: new analysis refuses Strava and unknown origins. Legacy displays need separate policy review.
- Regeneration preserves the reviewed goal and existing limit of three alternatives; applying a change requires revision checks and review.
- Never fabricate measurements, dated threshold evidence, actual completion or successful delivery.
- Optional plyometrics require individual suitability review; there is no universal weekly jump prescription.
- Keep RLS enabled. Disposable CI access does not verify production server-role grants.
- English and Spanish preserve units, identifiers, revisions and consent semantics.
- HRV alone cannot clear illness, pain or urgent-symptom holds. Confirmation cannot override safety holds.
- Token encryption and login limiting already exist. Do not resurrect retired unsigned/demo sessions.
- Personalized forecasts remain disabled; explicit target scenarios are not validated predictions. Legacy default-based predictions are retired. Altitude VO2max group data must not become individual power/pace prescriptions.
- Automatic error telemetry accepts only closed categories and static route shapes, never arbitrary exception text or stacks.

## Release/provider gates

`ENABLE_ACTIVITY_STREAMS` and `ENABLE_SMART_COACH_SUGGESTIONS` default off. Stream-based
progression thresholds are heuristics pending coach sign-off. Production collection needs a separately
approved migration, consent and role verification. This audit changes no production settings or sending.

Garmin direct publishing and COROS are not externally verified in JMM. COROS documents MCP workout
creation/editing; that does not establish JMM authorization or delivery. Intervals publication is conditional.
Calendar reminders and FIT downloads do not prove watch receipt. See the dated release/provider documents.

## Verification

`npm test`, `npx tsc --noEmit`, `npx prisma validate`, `npm run lint`, `npm run build`.
Hosted CI additionally exercises disposable PostgreSQL, authenticated routes, egress guards,
SDK-decoded FIT exports and EN/ES mobile browser acceptance. Check the exact PR head's evidence.
Never point fixture scripts at production. Compilation and provider mocks do not prove real OAuth,
inbox delivery, native Safari behavior or physical watch receipt.
