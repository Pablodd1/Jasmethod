# Device-assisted daily review

Fresh, compatible sleep duration, resting pulse and typed HRV observations from the same supported source enable a short athlete confirmation plus available training time. Provider connection or sync time alone does not enable it. Missing subjective ratings stay null; there is no invented questionnaire score.

Missing, stale, conflicting, truncated, estimated, unknown-origin or restricted observations retain the manual path. New symptoms or unusual recovery concerns use that path too. An existing symptom report, subjective review, reduction or smaller time allowance cannot be replaced by the shortcut. Historical RMSSD and SDNN remain separate.

The server binds the revision to the athlete, local date, observations and activity context. Submission rechecks observations, reported training, reconciliation, profile, setup and active plan in a serializable transaction. Workout reads and exports verify current evidence again through the shared canonical resolver. Existing activity-provenance, event, setup, double-session and time-budget restrictions remain in force.

Device-assisted review never enables PUSH. No physiology thresholds or dose tables changed. Optional weight and cycle context are retained; subjective recovery notes, measurement corrections and voice-applied answers use manual review. Today recognizes a saved device review only when its sessions resolve ready. Optional profile help, mood, menstrual context and additional measurements are collapsed.

The saved training-telemetry science briefing stays local. Absence of Strava and a query-string consent flag cannot establish external-AI permission for all device-derived ancestors. This does not change the separately consented personal-text conversation path.

## Verification

- Unit tests cover freshness, conflict, source/method eligibility, tenant binding, forged revisions, symptom/time protection, known reductions, activity revisions, canonical read/export invalidation and Today status.
- `scripts/jmm-device-checkin-integration.ts` exercises real HTTP/database saves and mobile English/Spanish browser flows in disposable CI PostgreSQL with external egress blocked. Evidence goes to `.local/jmm-device-checkin`.
- Full typecheck, lint, unit tests, production build and the existing CI browser/integration suite are release gates. The Windows checkout's generated review document must retain LF for its existing byte-for-byte reproducibility test; no document content changes are part of this feature.
- Live WHOOP authentication/sync, hardware microphone, production athlete data and wearable delivery are not established by synthetic acceptance. This is not a Garmin-compliance certification.

Disable the shortcut by returning null for `deviceReview` and rejecting `device_assisted` submissions; preserve saved records and canonical fail-closed reads. No schema migration or credential change is required.
