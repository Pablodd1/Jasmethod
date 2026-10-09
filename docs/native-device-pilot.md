# COROS + Apple Watch native pilot

This change is a **development pilot**, not a verified device integration. No provider account, OAuth grant, deployment, production migration, signing identity, or paid service is created by this change.

## Implemented boundaries

- COROS: lossless internal run/bike representation, documented MCP transport and read-only discovery, separate library/scheduled operation policy, raw polling boundary, and a gated tenant-bound OAuth authorize/callback/refresh/disconnect lifecycle with explicit broad read/write scope consent. Provider write schemas still require authenticated discovery. All publication remains disabled.
- Apple: revision-bound, owner-only JSON export and a native Swift package/example app for local import and WorkoutKit scheduling. This is JMM JSON, not Apple's `.workout` binary format. HealthKit reading is separate from WorkoutKit scheduling. There is no automatic native/server login or background workout upload.
- Web: English/Spanish pilot status explains the remaining setup. Missing or malformed capability values never enable the export link. `ENABLE_APPLE_WORKOUT_EXPORT=true` only enables file export; it does not make the native companion installed, signed, distributed, or tested.
- No existing Garmin/Intervals or Google login behavior is changed.

## Export security

`GET /api/workout/apple-export?sessionId=…&expectedRevision=…` authenticates using the existing web session, rejects cross-athlete exports (including coach impersonation), resolves the effective athlete-scoped prescription, and requires the exact revision. Current check-in/safety holds remain authoritative. Responses are private/no-store attachments with a constant filename. The file omits account email, profile, credentials, and raw athlete ID; it still contains personal workout information and should be handled privately.

Re-export after any plan/check-in/date/target change. An offline imported file cannot prove it is the current server revision. Removing a local schedule is not proof of removal from a watch. Never display a provider/library/local-scheduler response as watch receipt.

## Acceptance gates before enabling a real pilot

1. Review provider/SDK contracts and run source/type/test/build checks on the exact reviewed commit.
2. COROS: obtain separately approved user authorization/client registration, discover tool schemas, validate exact run/bike mappings and regional identity, validate the implemented tenant-scoped OAuth lifecycle, then add verified delivery records. Public-client remote revocation is not advertised by current metadata; local disconnect keeps a manual COROS revocation warning. No plaintext/manual-token user form is included.
3. Apple: build the package and example app with the current iOS SDK on a Mac/Xcode; configure signing and HealthKit capability in the user's approved developer workflow. No Apple distribution purchase is implied. See `apple-host-build.md` for reproducible unsigned host generation and `apple-companion.md` for native limitations.
4. Test on a paired iPhone/Apple Watch and a COROS device: timed and distance steps, pace/HR/power targets, recovery/repeats, exact dates/timezones, changed revisions, interrupted/repeated taps, cancellation and rescheduling. Inspect the device itself.
5. Validate completed-activity reads and ingestion separately: correct athlete, stable provider activity identity, deduplication, timezones, pagination, revocation, missing values and import provenance. Scheduling permission does not authorize HealthKit reads.
6. Obtain deployment/configuration approval before enabling or releasing. There is no production DB migration in this change.

## Verification labels

- Pure unit/contract tests can verify conversion, revision guards, disabled behavior, tenant rejection, and mocked protocol outcomes.
- Typecheck/build only verify the web application; they cannot compile Swift or prove Apple SDK compatibility.
- Swift test fixtures are synthetic and must be run on a Mac with the appropriate SDK before native readiness is claimed.
- Real grant/provider round-trip, on-watch execution, completed-activity ingestion, signing/distribution, and deployed authenticated UI checks are independent acceptance gates.
