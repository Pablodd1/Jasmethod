# Reproducible Apple companion host

## Status and scope

The native pilot now has a source-controlled XcodeGen definition, checked-in app metadata and HealthKit entitlement, and deterministic local generation/build commands. It links the existing Swift package instead of copying library or test sources. **Project generation, Swift compilation, simulator execution, signing and physical-device acceptance have not been run in this Linux workspace.** There is no Swift, Xcode or XcodeGen here. Static metadata/script checks do not satisfy those gates.

This is an iPhone SwiftUI host for the existing file-based pilot. It does not create a separate watchOS app; WorkoutKit schedules into Apple's Workout experience. It has no native account session, networking client, push registration, automatic sync, or server-side HealthKit ingestion. The app remains labelled an unverified source build. The full mapping and scheduling contract is in [apple-companion.md](apple-companion.md).

## Source of truth

- `native/apple/project.yml`: iOS 17 minimum, local `JMMWorkoutCore` and `JMMWorkoutKit` products, shared `JMMCompanion` scheme, both existing package test targets.
- `native/apple/Config/Info.plist`: app metadata and a read-only health purpose string.
- `native/apple/Config/JMMCompanion.entitlements`: only `com.apple.developer.healthkit = true`.
- `native/apple/.xcodegen-version`: generator pinned to **2.44.1**. Upgrade the pin and revalidate the generated project deliberately.
- `native/apple/scripts`: read-only preflight, generation, and unsigned simulator build/test wrappers.
- Generated `.xcodeproj`, build products, local signing overrides and results are ignored. Edit the definition and regenerate; do not treat edits to the generated project as durable source.

The package test targets stay Swift Package targets, so `Bundle.module` continues to resolve the core fixture. The shared scheme includes both via XcodeGen's package-test references. It does not replace the tests with copies or count an absent SDK suite as passed.

## Prerequisites on the developer's Mac

1. An already installed **Xcode 16 or newer**, selected for command-line use, with its **iOS 18 or newer SDK**. The app can deploy to iOS 17; the compiler needs the newer SDK to resolve the iOS 18 APIs behind availability checks. A compiler availability guard does not add missing declarations to an older SDK.
2. The officially published **XcodeGen 2.44.1** available on `PATH`. Obtain it through the developer's approved installation process using the [official tagged release](https://github.com/yonaskolb/XcodeGen/releases/tag/2.44.1). The scripts neither download nor install tools.
3. For test execution, an installed compatible iOS Simulator runtime and available iPhone simulator. A generic simulator destination can compile but cannot execute tests. Include iOS 17 minimum-runtime testing if supported by the selected Xcode/Mac, as well as a current runtime. Missing older runtimes remain an acceptance gap; do not pretend a current-runtime test covered them.

Inspect first:

```sh
# From the repository root. These commands do not change system setup.
xcode-select -p
bash native/apple/scripts/preflight.sh
xcrun simctl list devices available
```

The preflight checks the operating system, exact XcodeGen pin, Xcode version, simulator SDK and selected Swift toolchain. It never accepts a license, downloads a runtime, signs in, or changes the selected Xcode. If an existing alternate Xcode is needed, the developer can set `DEVELOPER_DIR` for that command; no global `xcode-select --switch` is necessary. Developer setup prompts and installations require their own approval.

## Generate and compile the host

```sh
# From the repository root; no Apple account or team is needed.
bash native/apple/scripts/generate-host.sh
xcodebuild -list -project native/apple/JMMCompanion.xcodeproj
bash native/apple/scripts/verify-simulator.sh build
```

The build wrapper regenerates from the checked-in definition and runs the equivalent of:

```sh
cd native/apple
xcodebuild \
  -project JMMCompanion.xcodeproj \
  -scheme JMMCompanion \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath .build/host-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  build
```

The wrapper also saves a uniquely named `.xcresult` beneath `native/apple/.build/verification`. Compilation covers the host, SwiftUI view and linked Apple framework adapter, rather than only Foundation model code. The project uses Swift 5 language mode with complete concurrency checking; review diagnostics rather than describing an uncompiled source tree as Swift 6-clean. There are no remote Swift package dependencies or package build-tool plugins.

## Run the package tests on iOS Simulator

Choose an actual iPhone simulator UUID from `xcrun simctl list devices available` and replace the placeholder:

```sh
bash native/apple/scripts/verify-simulator.sh test YOUR_SIMULATOR_UDID
```

The script rejects a placeholder or malformed UUID and never selects a physical device. Its test command is equivalent to:

```sh
cd native/apple
xcodebuild \
  -project JMMCompanion.xcodeproj \
  -scheme JMMCompanion \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' \
  -derivedDataPath .build/host-derived-data \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Check the result bundle for both `WorkoutCoreTests` and `WorkoutKitMapperTests`. At the initial pilot handoff there are 16 core tests and 3 mapper tests; inspect the current source when reporting a count. A run with missing, skipped or undiscovered mapper tests does not pass the SDK test gate. These are unit tests, not UI automation and not real scheduler/HealthKit/device tests.

For a separate **core compilation** check on a Mac:

```sh
xcrun swift build --package-path native/apple --target JMMWorkoutCore
```

That command does not compile the host or run the test suites. The package's macOS 13 core platform must not be mistaken for the macOS 15 availability of its WorkoutKit adapter. Prefer the explicit iOS Simulator test command above for the complete native pilot; a generic `swift test` is a macOS test run and does not prove the iOS host compiles.

## HealthKit and signing boundary

The checked-in entitlement describes the intended app capability. It does not register an App ID, obtain a provisioning profile, or grant access to anyone's health data. The default project disables code signing and has no development team. The bundle identifier is a `com.example` placeholder, not an existing user app identity. No `-allowProvisioningUpdates` option is used.

Apple defines `NSHealthShareUsageDescription` as the read-purpose key and `NSHealthUpdateUsageDescription` as the write-purpose key. The source requests only `HKObjectType.workoutType()` with an empty `toShare` set. Accordingly the host contains only a read purpose string; it does not imply write permission. Workout scheduling authorization is a separate explicit UI action. Health read denial stays opaque to the app, and an empty query must remain ambiguous. See [Apple's purpose-string reference](https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthshareusagedescription) and [authorization guidance](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data).

The host does not declare HealthKit background delivery, clinical records, keychain groups, associated domains, push, background modes, or an invented WorkoutKit entitlement. The file importer grants access only to the user-selected file. The user reviews health summaries locally and explicitly chooses any file export destination. Verify these paths with an actual provisioned build; plist inspection alone cannot establish permission behavior. [Apple's HealthKit setup](https://developer.apple.com/documentation/xcode/configuring-healthkit-access) explains capability/profile configuration.

Only after the developer explicitly authorizes physical-device signing, use their existing App ID/profile/team and approved identity. If those do not exist, stop for that separate setup; do not enroll, register, purchase or enable automatic provisioning implicitly. For an already approved manual profile, the command shape is:

```sh
# Developer-only example. Replace every placeholder after explicit approval.
# This is a build, not an install, archive, TestFlight upload or App Store release.
xcodebuild \
  -project native/apple/JMMCompanion.xcodeproj \
  -scheme JMMCompanion \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath native/apple/.build/device-derived-data \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM=YOUR_APPROVED_TEAM_ID \
  PRODUCT_BUNDLE_IDENTIFIER=YOUR_EXISTING_APP_BUNDLE_ID \
  CODE_SIGN_IDENTITY='Apple Development' \
  PROVISIONING_PROFILE_SPECIFIER=YOUR_EXISTING_APPROVED_PROFILE \
  build
```

Keep local identity/profile overrides out of version control and use the normal developer signing/install workflow. Installation, device trust, signing agreements and distribution are separate decisions. No production icon, store privacy declaration, accessibility certification or distribution acceptance is claimed by this pilot.

## Acceptance evidence, in order

Local wrapper regression checks can be run without Apple tooling:

```sh
bash -n native/apple/scripts/preflight.sh native/apple/scripts/generate-host.sh native/apple/scripts/verify-simulator.sh
python3 native/apple/scripts/test_host_scripts.py
```

The 15 Python checks passed in the Linux workspace, including fail-closed unsupported-toolchain behavior, pinned-version enforcement, unsigned simulator dispatch, failed-command reporting, paths containing spaces, and plist boundaries. They substitute fake command-line tools and do **not** execute XcodeGen or Swift. YAML parsing and referenced configuration paths were also checked locally, not with XcodeGen's generator.

1. Static YAML/plist/script checks: file structure and fail-closed wrappers only. They run without Apple SDKs.
2. XcodeGen generation: record exact version and successful generated target/scheme listing.
3. Swift core build, iOS host build and both simulator test suites: record commit, Xcode build version, SDK, deployment target, runtime, counts and `.xcresult`. Keep warnings and failures visible.
4. Simulator UI smoke: import/cancel a fixture, review full content, choose location, malformed-file errors, repeated actions, and denied/unavailable API behavior. No network or automatic upload should occur. This is a distinct manual gate.
5. Explicitly authorized signed iPhone build and a paired Apple Watch on supported versions: inspect the actual Workout app, then execute representative running/cycling plans. Confirm interval order, time/distance/manual endpoints, all target units, date/timezone, current-vs-older revision handling, capacity, deny/revoke, interrupted replacement, crash/restart, cancellation and completed protection.
6. Separate HealthKit tests: permission denial/empty data, measured values and absent fields, optional plan association, result truncation, export/cancel, and no launch-triggered read or upload. Local scheduler readback and completion flags never count as watch receipt or measured activity ingestion.

Record these as separate pass/fail/not-run gates. A generated project or green web suite cannot establish physical watch delivery. Do not enable real-user rollout until its required gates and release approval are satisfied.

## Authenticated continuous sync: proposed design, not enabled

The existing backend authenticates a web session cookie (`src/lib/auth.ts`); it does not expose an approved native grant or bearer-token flow. Reusing browser cookies or accepting a token pasted into the companion would create an unsafe, unreviewed integration. The current build therefore stays file-based.

A future implementation can be prepared and unit-tested with synthetic sessions, fake transports and a disabled feature flag. Live issuance/storage of persistent credentials, granting ongoing access, signing/associated-domain setup and health-data transmission need explicit approval. No such capability is activated by this host definition.

### Authentication and tenant isolation

- Use an external user-visible web authentication session (`ASWebAuthenticationSession`) and a reviewed authorization-code flow with PKCE S256 and unpredictable state. Validate the exact callback; bind the one-use, short-lived code to the client, redirect, verifier and athlete. A native app must not contain a shared client secret. Use the iOS 17-compatible authentication API and availability-gate newer callback APIs. This is a proposed server addition, not behavior supplied by opening the current web login page. See [Apple's web authentication API](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession), [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) and [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).
- Introduce independently revocable native sessions with bounded scopes and expiry. Separate prescription fetch/scheduling from completed-health-summary upload. Store only the minimum approved credential in a device-only Keychain item, with access policy selected and tested for the authorized foreground/background use. Do not place it in Files, UserDefaults, logs, exported JSON or source. [Keychain Services](https://developer.apple.com/documentation/security/keychain-services) is the intended storage API.
- Derive athlete identity from the verified server session, not a JSON athlete ID, locally selected account, plan title or date. Require current prescription revision and safety/check-in state before scheduling. Offline stale data cannot prove freshness; future automatic writes must pause when that verification is unavailable.
- Never treat native login, WorkoutKit permission, HealthKit reading, and ongoing health-data upload as one consent. Specify the JMM recipient, workout summary fields, purpose, backfill window and cadence before enabling any upload. Sign-out/revoke must cancel pending work and prevent an old account's queued health samples or schedule ownership from carrying over to a new athlete.

### Durable synchronization and truthful status

- Use a serial per-athlete reconciliation worker, persisted intentions and stable operation IDs. A fetch is not permission to silently replace or remove a reviewed local plan. Preserve capacity, ownership, completed-plan and explicit replacement safeguards; never auto-evict unrelated workouts. Record local schedule readback separately from any physically verified watch evidence.
- For authorized completed-workout ingestion, use bounded `HKAnchoredObjectQuery` batches with both additions and deletions. Store query anchor and outbox durably together, then upload idempotently using `(athleteId, HealthKit sampleId)` plus payload/version checks. Remove outbox entries only after durable server acknowledgement. Retry identical requests with bounded backoff; never advance past undurable data or interpret read denial as deletion. Query definitions/backfill windows and anchors must be versioned together. [Apple's anchored-query API](https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery) supplies the change boundary.
- Server ingestion must validate size, types, finite measurements, timestamps and provenance; resolve plan ownership; preserve unmatched samples; and avoid inventing a prescription revision from plan ID. Deletions need an explicit retention/reconciliation policy, rather than silently rewriting completed coaching history. Deletion notifications are not a permanent audit log, so reconciliation must acknowledge incomplete histories. See [HKDeletedObject](https://developer.apple.com/documentation/healthkit/hkdeletedobject).
- Background HealthKit delivery would require the separate background-delivery capability plus observer handling, completion callbacks, approved persisted access and actual device tests. The OS controls opportunities; it is not an always-running loop or guaranteed real-time delivery. Follow [Apple's background-delivery contract](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)); simulator tests cannot validate it. Foreground catch-up and visible last-attempt/last-acknowledged times remain necessary.
- Add failure/recovery tests before enabling: cross-athlete requests, account switching, consent changes, revoked/expired sessions, stale plan revisions, concurrent taps, crash between mutation/readback or persistence/acknowledgement, partial batches, duplicate/reordered uploads, deletion, airplane mode, device lock and unavailable watch. Keep scheduling and ingestion independently observable and independently disabled.

These are engineering acceptance criteria, not a shipped connection. The next executable step is to generate and compile this host on an authorized Mac, then address actual SDK diagnostics before adding live authentication or claiming automatic sync.

## Build-tool reference

The [pinned XcodeGen project specification](https://github.com/yonaskolb/XcodeGen/blob/2.44.1/Docs/ProjectSpec.md) documents local package paths, product dependencies, settings and package-test references used here. Source/API references were checked on 2026-10-09. There is no guarantee that a future tool upgrade preserves the same generated output; record the exact versions used for acceptance.
