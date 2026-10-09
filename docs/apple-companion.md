# Apple WorkoutKit native companion pilot

## What is implemented, and what is not verified

This checkout contains a native Swift package, a SwiftUI iPhone host source file, shared JSON fixture, TypeScript contract tests, and Swift XCTest sources. It is **not a signed or installed application**. No Apple account, App ID registration, OAuth grant, credential, signed capability, distribution, or deployment was created. The reproducible host definition now declares a read-only HealthKit entitlement in source; it has not been provisioned or granted. This Linux workspace has neither Swift nor Xcode; **none of the Swift code has been compiled or executed here**. SDK compilation, signing, simulator tests, pairing, watch delivery/execution, and HealthKit data access remain acceptance gates. A passing web test does not validate Apple SDK calls or a real watch.

The server's authenticated export route emits `.jmmworkout.json`. This is JMM's versioned intermediate format, **not** an Apple `.workout` binary and not a file the Apple Workout app can directly import. Import it into the native host, review it, choose indoor/outdoor, authorize Workout scheduling, and explicitly schedule it. The companion has no network client and does not import browser cookies. File import provides a testable boundary without granting a new native app persistent access to the athlete's account.

## Files and contract

- `src/lib/apple-workout-export.ts`: `buildAppleWorkoutExport`, `appleWorkoutPlanId`, `AppleWorkoutExportError`.
- `native/apple/Sources/JMMWorkoutCore`: bounded contract validation; durable local schedule ledger; coordinator with serialized mutations and an injectable scheduler port.
- `native/apple/Sources/JMMWorkoutKit`: actual `CustomWorkout`/`WorkoutPlan` mapping, `WorkoutScheduler` adapter, and a separate read-only `HealthKitReader`.
- `native/apple/ExampleApp/JMMCompanionApp.swift`: native SwiftUI host using Files import/export, review, authorization, schedule/replace, refresh and cancellation actions. Not a WebView.
- `native/apple/Tests`: 16 core tests and 3 SDK mapper tests, supplied but unexecuted here. The run fixture is also checked by the executable TypeScript test.

The envelope includes schema/kind, stable plan UUID, session identity, opaque revision/hash-derived revisionNumber, export time, local date/timezone, title/sport, and explicit ordered steps. It always labels `hardwareVerified: false` and `localSchedulerOnly: true`. Athlete IDs, profile inputs and credentials are not exported; resolved workout targets and free-text notes can still contain personal/health information. Treat downloaded files accordingly.

Identity is UUID-v8-shaped SHA-256 over a domain separator, athlete identity, and session identity; revisions and dates do not change it. `revisionNumber` is **not chronological**. The offline client cannot establish freshness, verify file provenance, or enforce a later server check-in/safety change. `exportedAt` is informational and unsigned. Obtain a new authenticated export after edits, new check-ins or target/safety changes. Only open files the user deliberately downloaded and reviewed.

Imports are capped at 256 KiB and 50 expanded steps. Unknown fields, schema, sports, targets, malformed numbers, unsupported repetitions, conflicting endpoints, impossible dates and misplaced warmup/cooldown are rejected. No truncation, prose inference or silent target substitution is permitted.

## Mapping semantics

- Run → `.running`; bike → `.cycling`. The user explicitly selects location, and the SDK's activity/goal/alert support predicates must pass before any scheduler mutation.
- Time → seconds; distance → meters; manual lap → open goal requiring manual advance. Duration estimates are not exported as endpoints.
- Open effort → no numeric alert. Watts → `PowerRangeAlert`; bpm → `HeartRateRangeAlert`; speed → meters/second `SpeedRangeAlert` using current metric. Pace is seconds/km and is converted to `[1000/high, 1000/low]` meters/second without rounded bounds.
- One leading warmup and one trailing cooldown remain separate. All other expanded steps preserve order in a single block with one iteration. Existing repeated steps are not expanded twice or collapsed heuristically.
- Step names use the iOS 18/watchOS 11 API when available. On iOS 17/watchOS 10 names remain in the companion review. Group labels and notes are preserved in that review, not encoded as watch instructions; the host explicitly warns about this limitation. Do not rely on the watch to show the complete coaching text.

Apple's current framework declarations, rather than the pre-release names in the WWDC23 transcript, informed this code. Minimum scheduling/mapping APIs are iOS 17/watchOS 10. The package's Foundation core can target macOS 13; WorkoutKit implementations are guarded for macOS 15.

## Scheduling, idempotency and truthful status

1. Import/review has no permission or scheduling side effect. The authorization button requests Workout scheduling permission. HealthKit authorization is entirely separate.
2. Validate and check authorization/capacity; do not evict other plans.
3. Consult the durable ownership record. Existing unknown identities cannot be adopted, replaced or removed. Known identities must have the same recorded session ID. Files are unsigned: these checks prevent accidental identity-only mutation, not cryptographic verification of the file or athlete.
4. Write pending intention before mutation. Serial execution plus a busy guard prevents actor reentrancy from double taps.
5. The exact same local digest, native content and date is idempotent. Re-export time is excluded from the digest. Other envelope changes, including revision, notes, groups, location or timezone, require explicit replacement even if Apple's native model compares equal.
6. Replacement removes only this recorded plan's instances, checks removal, then schedules and checks again. This is not transactional: failed replacement can leave no scheduled workout. The UI discloses this before confirmation. Completed plans are never overwritten or removed.
7. SDK scheduling returns no delivery receipt. Only full local readback establishes `scheduledLocally`. The adapter requires native equality and date components including timezone/calendar metadata. If the SDK strips these fields, readback remains inconclusive rather than claiming exactness; validate normalization on devices before adjusting this conservative policy.
8. Pending schedule retry does not automatically repeat an unconfirmed mutation. Refresh is read-only. Explicit replace/reschedule is a separate user action. Cancellation requires the recorded owner identity and verifies absence. Pending removals and cancelled revisions require explicit reschedule confirmation, including after a crash before cancellation readback.

A local schedule entry or completion flag never proves physical watch receipt, execution, duration, distance, heart rate or power. There is no fabricated web "connected", "delivered" or "completed activity" state from this companion. Removing a ledger/installing anew loses local provenance; unknown scheduler entries must then be inspected/removed by the user, not automatically reclaimed.

## Optional completed-workout boundary

`HealthKitReader` requests only workout read access after a distinct tap. It requests no writes, background access, heart-rate streams, routes or credentials. A separate foreground read is capped at a 31-day window and 100 summaries; the sample host reads seven days. The 100-result case is labelled possibly truncated. Apple intentionally hides read denial, so successful permission flow or empty results does not prove access or absence of activity.

Returned local summaries include measured duration, optional total distance, timestamps, sample UUID, source app, sport, and an optional WorkoutKit plan UUID from `HKWorkout.workoutPlan`. Missing values stay absent. Plan UUID association does not identify a prescription revision or establish that this was the latest exported plan. Summary export uses another explicit user action after review. No data is automatically sent anywhere.

**Server ingestion is deliberately not implemented by this package.** A future authorized ingestion route must authenticate the athlete independently of the file; validate bounds/types; deduplicate `(athleteId, HealthKit sampleId)`; resolve plan ownership server-side; retain source provenance; handle edited/deleted samples and pagination; and never overwrite completed activity, infer revision, or attach an unmatched sample by title/date alone. User approval to read HealthKit is not approval to upload it. The exported JSON is an auditable handoff format, not proof of a completed ingestion.

## Build and acceptance handoff

1. On a Mac with supported Xcode, open `native/apple/Package.swift` and run the core tests. With a current Apple SDK also run the mapper tests. Command-line package testing: `swift test --package-path native/apple`; the SDK suite requires macOS 15+ or an iOS/watchOS test destination.
2. Use the checked-in XcodeGen host definition and scripts in [apple-host-build.md](apple-host-build.md) to generate and compile the iOS 17+ host against Xcode 16+/iOS 18+ SDK. The default is unsigned simulator-only; configure physical-device signing only under separate approved setup. Do not enroll/register or pay implicitly.
3. For optional HealthKit reading, add the HealthKit capability and `NSHealthShareUsageDescription` explaining local completed-workout review. This code requests no HealthKit writes. Verify the current signing/capability requirements in Xcode and Apple's sample rather than inventing an entitlement key.
4. Compile against deployment targets iOS 17 and current iOS. Check Swift concurrency diagnostics and SDK availability. Swift source tests are not counted as passed until run on this host.
5. On a paired watch, explicitly test running and cycling, time/distance/manual steps, warmup/recovery/cooldown order, zero-to-upper watts, bpm, equal pace bounds and pace range inversion. Inspect each target before starting.
6. Test deny/revoke authorization, unavailable watch, capacity exhaustion, duplicate taps, app restart while pending, refresh after delayed readback, same export, changed revision/notes/timezone, cancellation, failed replacement and completed protection. Capture readback and screenshots independently from on-watch evidence.
7. Separately test HealthKit read denial, partial/empty data, plan association absent, 100-result truncation, local export cancellation, duplicate sample import handling when ingestion is implemented, and that no read/export occurs automatically.

No deployment or authenticated provider/device test was performed here; production rollout and any new credentials/grants require separate approval. Acceptance status must continue to distinguish web contract tests, Swift compile/unit tests, local scheduler checks and actual watch execution.

## Official sources checked 2026-10-09

- [WorkoutKit overview](https://developer.apple.com/documentation/workoutkit)
- [CustomWorkout initializer and support predicates](https://developer.apple.com/documentation/workoutkit/customworkout)
- [WorkoutGoal units](https://developer.apple.com/documentation/workoutkit/workoutgoal)
- [WorkoutScheduler and authorization](https://developer.apple.com/documentation/workoutkit/workoutscheduler)
- [Asynchronous scheduledWorkouts readback](https://developer.apple.com/documentation/workoutkit/workoutscheduler/scheduledworkouts)
- [Stable WorkoutPlan ID initializer](https://developer.apple.com/documentation/workoutkit/workoutplan/init(_:id:))
- [Heart-rate frequency units](https://developer.apple.com/documentation/workoutkit/heartraterangealert/init(target:)) and [WorkoutAlertMetric.countPerMinute returning UnitFrequency](https://developer.apple.com/documentation/workoutkit/workoutalertmetric/countperminute)
- [Speed range and metric](https://developer.apple.com/documentation/workoutkit/speedrangealert/init(target:metric:)) and [iOS 17 power initializer](https://developer.apple.com/documentation/workoutkit/powerrangealert/init(target:))
- [Step displayName initializer, iOS 18/watchOS 11](https://developer.apple.com/documentation/workoutkit/workoutstep/init(goal:alert:displayname:))
- [HKWorkout.workoutPlan async association, iOS 17/watchOS 10](https://developer.apple.com/documentation/healthkit/hkworkout/workoutplan)
- [HealthKit authorization and read-denial privacy](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [Setting up HealthKit](https://developer.apple.com/documentation/healthkit/setting-up-healthkit)
