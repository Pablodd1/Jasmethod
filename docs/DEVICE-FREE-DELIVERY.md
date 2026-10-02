# Device-free daily delivery boundary

Implementation branch: `dot/device-free-launch-20261002`. No deployment or production migration is authorized by this document.

## Runtime switches

- `ENABLE_INTERVALS_CONNECTOR=true` explicitly enables the optional Intervals.icu connection and calendar-note publishing paths. Unset, empty, false, or any other value disables them. This is server-owned, not a public build-time flag.
- Disabled state hides setup cards, push buttons, and connection nudges; connect, publish, webhook, and direct sync requests fail closed. Library network functions independently check the switch before HTTP. Existing saved connections are preserved.
- If enabled, Intervals currently receives a calendar event with canonical step/end/target instructions. Long descriptions disclose truncation and direct athletes to full app instructions. No native structured provider export or watch receipt is claimed. The legacy ZWO helper remains unvalidated and is not used by a network path.
- `ENABLE_AUTOMATED_DELIVERY=true` is a separate default-off reminder/review gate; per-channel consent is still required. See the release report for reminder coverage.

## Screen and file

Both Today and `/daily` resolve the athlete-scoped effective session. Daily schema 2 includes `sourceRevision` (SHA-256), the numeric compatibility revision, explicit time/distance/repetition/manual endpoints, and the per-session export capability. Schema 1 remains read-compatible for the supplied developer-kit fixture only.

The FIT controls bind selected session ID and source revision to the GET download URL. GET downloads and sharing never approve, email, or mark completion. Approval is a separate explicit action. Concurrent clicks are guarded; navigation aborts the pending fetch. Share cancellation has its own status and does not cause a download or success claim; unsupported/rejected file sharing can fall back to one download.

Only actual timed endpoints contribute to exact timed totals. Distance/repetition/manual steps retain duration estimates separately. Imperial swim distance displays yards; canonical and FIT distance stay metres. Running reference tables are hidden for unrelated sports. Reference anchors must come from the shared resolver's evidence-filtered profile.

Garmin JSON export is retired with authenticated HTTP 410. Manual help explains compatible device USB file access, `Garmin/NewFiles`, safe disconnect, activity-specific workout menus, Mac/MTP limits, and step inspection. It links Garmin's official compatibility guide. No Garmin Connect structured-workout import, automatic sync, mobile-only transfer, or device receipt is promised.

## Reported execution

Migration `20261002201000_reported_workout_actuals` adds nullable `Workout.actualSport` and `Workout.actualDetails` only. Planned sport, duration and date remain unchanged. Existing rows retain nulls. Apply through the normal reviewed migration flow; this work did not apply it to production.

Outcomes: completed, partial, substituted, skipped, unknown. Only completed sets the completed boolean. Missing actual minutes/effort never become planned minutes, zero, or a default effort. Blank/null values can clear an earlier report; omitted fields retain existing reports.

Optional `actualDetails` accepts numeric or null `distanceKm`, `reps`, `loadKg`, with finite range checks and integral repetitions. Stored JSON carries schema version, athlete-report provenance, session-local observation date, and separate entry time. These quantities remain self-reports.

## Evidence limits

Focused tests cover guarded default-off network paths, endpoint/target contracts, metric/imperial display, static rendered sport-aware content, share success/cancel/fallback, and actual-feedback semantics. Local HTTP tests are recorded separately by the integration test run. Static rendering does not establish interactive browser, mobile OS share-sheet, or hardware behavior. No watch model/firmware has been accepted by this change; compatibility remains unverified.
