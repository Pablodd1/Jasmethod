# Explicit sport structures and faithful export scope

Engineering implementation, 2026-10-02. This is SDK/software evidence, not hardware acceptance or a coaching/medical review. No production migration or deployment was performed for this feature.

## Single source and admission

`Workout.prescription` persists `sportStructure` with `schemaVersion: 1`. `src/lib/sport-structure.ts` defines the discriminated union and strict shape validator. There is no database schema addition. Structure is author-supplied: the system does not parse exercise names, sets, station weights or bike/run splits from titles or notes. Existing ambiguous prescriptions remain web guidance with a meaningful unavailable reason.

Canonical resolution compiles the same structure for Today, Daily, messages and FIT. It preserves original reps/distance/lap endpoints and estimates separately. Source metadata, units, loads, stroke, transitions and component target anchors participate in the content revision. Export rechecks the current safety/athlete scope and expected revision.

Duration-weighted planning density is unavailable when any step lacks prescribed/estimated timing; partial rest timing does not become a fabricated low score. Complete estimated step timing is labeled as an estimate.

Check-in retains explicit structure and its declared budget. When the general adaptation would require reduction or cannot preserve the original steps under its intensity/time limit, it holds the session for structure review rather than generating replacement exercise/station facts. Same-sport plan edits preserve and hold source metadata; switching sports intentionally invalidates incompatible structure. The generic variant endpoint refuses structured sport records.

## Support matrix

| Source sport | Encoded artifact | Honest limitation |
| --- | --- | --- |
| Run | Running FIT; time/distance/lap; resolved pace/speed/HR/open | Hardware unverified |
| Bike | Cycling FIT; time/distance/lap; resolved watts/HR/open | Hardware unverified |
| Pool swim | Swimming / lapSwimming FIT; explicit lengths, stroke target, pool length and units, fixed timed rest | Send-offs remain web-only; hardware unverified |
| Open-water swim | No FIT; distinct web context | Profile/device workflow unverified |
| Strength | Generic timed/lap FIT; each individual set and rest retained | Reps are instructions followed by LAP, not native rep-count tracking |
| HYROX | Generic timed/lap FIT with supplied run/station order, reps/distance/load | Non-time blocks use LAP; no native HYROX encoder |
| Mobility / active recovery / boxing | Existing generic timed/lap FIT | Technique remains in app; no native boxing claim |
| Brick | ZIP with ordered native component FIT files and transition-manifest.json / README | Manual start per component; transitions are not auto-executed; no single-file multisport claim |
| True rest / safety hold | No FIT | Resolve applicable review/check-in requirement |

Every capability has `deviceTested: false`. A file download or completed share sheet is not provider publication, import confirmation, or watch receipt.

## Explicit schema

The editor offers draft-only examples from `sport-structure-examples.ts`. Choosing an example does not save it. Athletes must replace example values with the actual prescription and apply it explicitly. Examples are format examples, not recommended training.

- Pool: `poolLength: {value, unit: "m"|"yd"}` and ordered `lengths` / `rest` steps. Each swimming step requires explicit whole lengths, stroke, phase and effort zone. Strokes: freestyle, backstroke, breaststroke, butterfly, drill, mixed, IM. IM requires lengths divisible by four. Optional send-off seconds mean start-to-start timing and disable FIT; they are never rewritten as fixed rests. Pool lengths must be exactly representable in centimetres, including 25 yd = 22.86 m.
- Strength: ordered individual `set` records with stable exercise ID/name, contiguous set numbers starting at 1, explicit reps/time/lap endpoint, optional kg/lb load, estimate and note. Rests are distinct timed entries. Optional warmup/cooldown entries use time/lap. No combined lift text is inferred.
- HYROX: ordered explicit run/station entries, station ID, endpoint and optional load; rests and preparation are separate. At least one actual run and station are required. No competition-standard distance/load is supplied automatically.
- Brick: 2–10 ordered components with stable unique IDs and real run/bike steps or a nested explicit pool structure. Exactly one ordered transition between each adjacent pair supplies its instruction and time/lap endpoint. Nested/mislabeled multisport components are rejected.

Limits are defensive and explicit: 1,000 expanded parent steps, 50 encoded steps per FIT file, 10 brick components, bounded repeats/values, 64 KiB streamed edit requests. The 50-step policy is conservative device compatibility policy, not a FIT-format maximum. A valid 50+transition+50 brick produces two files. A 51-step component blocks the split. Nothing is silently truncated except optional device notes/name presentation; full source remains in the app. Essential generic identity/quantity/LAP instructions must fit 180 UTF-8 bytes and are placed first in notes, otherwise the companion is gated.

## API and user controls

- GET `/api/workout/structure?id=...` returns persisted source metadata, current canonical revision, declared budget and editability reason.
- PATCH same route accepts only `{id, expectedRevision, sportStructure}`; null explicitly clears structure and superseded executable steps. Old generic steps are not resurrected. Shape validation does not change safety admission.
- Both use `trainingAccess`. Writes use a serializable transaction and athlete advisory lock, fresh DB-backed canonical revision, owner-scoped reads/writes, history/measurement guards, audit logging and a post-write read. Prior dates and recorded sessions cannot be rewritten.
- Today and Daily provide accessible JSON controls with fresh reload, explicit save/clear, invalid-field feedback, status announcements and draft-only examples.
- GET `/api/workout/approve?sessionId=...&expectedRevision=...` remains the side-effect-free workout download. A brick returns `.zip` and `application/zip`; other enabled mappings return `.fit`. UI labels and share MIME match the actual artifact. POST approval remains separate.
- Complete training-data bundles include the same ordered component files and transition manifest under a session-specific directory. They do not create another exporter or bypass admission.

## SDK validation

Pinned dependency: official `@garmin/fitsdk` 21.214.0. Authoritative local evidence inspected in its `src/profile.js` and exercised through Encoder/Decoder:

- WORKOUT `poolLength` is a main field scaled by 100 and decoded in metres; `poolLengthUnit` is `metric` or `statute`.
- WORKOUT `sport=swimming`, `subSport=lapSwimming`.
- WORKOUT_STEP `durationValue` main field uses raw centimetres for distance and milliseconds for time.
- `targetType=swimStroke`, `targetValue=0..6` decodes to the corresponding `targetStrokeType` enum. No ignored subfield key is used for encoding.
- Pool fixed rests use an independent timed step with `intensity=rest`; no send-off is encoded as rest.
- Strength/HYROX generic reps/distance endpoints deliberately encode as `durationType=open`; the exact source endpoint and required manual LAP action lead the notes. They are not asserted to decode as native repetitions or automatic distance tracking.

Each enabled mapping fixture asserts `Decoder.checkIntegrity()`, errors=[], workout file type, sport/subsport, contiguous indices, endpoint/target semantics and order. Tests include all seven pool strokes in both metres and yards, source quantity/metadata preservation, rest/send-off distinction, all nine sports' rendered canonical screen parity, exact timed totals with transitions, unknown totals, 50-step per-component policy, invalid fields/units/order, load edits changing revision, rest/safety, and long-note disclosure.

Focused command (33 tests at implementation checkpoint):

```
node --import tsx --test src/lib/sport-structure.test.ts src/lib/sport-structure-edit.test.ts src/lib/sport-structure-store.test.ts
```

The existing `canonical-fit.test.ts`, delivery-contract tests, connection/approval side-effect tests and complete test suite remain required. Independent HTTP/database acceptance and final build results are recorded by the final launch verification, not presumed by this document. Browser interaction and physical-device USB/execution must be reported separately; no named-device badge is earned by these SDK fixtures.
