# Race evaluation contract and preregistration protocol

Status: **synthetic correctness scaffold only**, 8 October 2026. No real athlete records have been collected, imported, exported, fitted, or evaluated by this change. No accuracy, calibration, or sustainable-effort claim is established. The legacy personalized forecast gate remains unchanged.

This original, dependency-free implementation responds to the [prediction-validity audit](prediction-validity-audit.md) and [comparative audit](comparative-audit.md). It does not copy competitor implementations or introduce a model, API route, storage schema, provider integration, or automatic athlete-data access. The public product remains an explicit-target scenario calculator.

## What the code checks

`src/lib/race-evaluation.ts` is a pure, typed, offline TypeScript contract. It is not a parser for untrusted JSON, a public upload endpoint, a consent system, a durable snapshot store, or an experiment runner. Any future import boundary needs separate runtime shape validation, access controls, consent and source review. Do not pass arbitrary JSON directly to these functions.

- `validateFrozenRaceRecord` checks required identity, a supported evaluation schema, declared chronology, evidence availability, and a positive elapsed estimate or explicit abstention.
- `evaluateRaceRecords` joins exact athlete-and-event identities within one declared model/cohort/time basis and returns a row for every submitted record. It does not choose the best of repeated snapshots. All duplicate record IDs, snapshot IDs, and athlete/event pairs are excluded. Duplicate outcomes are ambiguous and excluded; unmatched outcomes are returned separately.
- `partitionByAthlete` uses an explicit preregistered list of held-out athlete pseudonyms. Every record from those athletes goes into the holdout. It neither randomizes nor selects that list. The caller must verify the holdout is populated and both groups are suitable for the registered experiment.
- `rollingOriginTrainingEligibility` checks one candidate/outcome against one target. The candidate event and its usable finished outcome must both precede the target's freeze; labels available exactly at that freeze are conservatively excluded. The target and training record must share cohort and elapsed-time basis. Same-event and held-out-athlete candidates are rejected. Earlier races by a returning athlete are permitted when that athlete is not held out. A valid prior abstention can still supply an earlier observed label; a malformed estimate cannot. This helper does not fit anything or deduplicate a complete training set. The caller must deduplicate the selected training set and freeze its membership manifest before fitting.

The API intentionally requires a declared data kind: `synthetic` produces `synthetic-correctness-only`; `consented-pseudonymous` produces `unvalidated-real-data-evaluation`. The latter is a label for the contract's intended future input, not a determination that consent exists or an assertion that a method is validated.

## Frozen pre-race chronology

For every record:

1. Each evidence item has `availableAt <= frozenAt`.
2. The complete estimate and its selected model/input versions have `frozenAt <= cutoffAt`.
3. `cutoffAt < eventStartAt`, strictly. Freezing at or after the event is ineligible.

All timestamps require an explicit UTC/offset time with seconds. Invalid calendar dates, local times without offsets and date-only strings are rejected. Equality of evidence availability and freeze is allowed because the record may include information available at that instant. Training outcome availability is stricter: it must be earlier than the actual target freeze, not merely earlier than a later nominal cutoff.

Evidence includes all selected targets, baselines, course revisions, weather forecast vintages and any fitted parameter/model artifacts used to produce the frozen estimate. `availableAt` means when the exact value/version could actually be used, not when an activity happened or the future time for which weather was forecast. Preserve original observation, publication, ingestion and forecast validity timestamps in the referenced archive; do not substitute a post-race historical weather observation for an earlier forecast. Weather may be valid during a future race while its forecast vintage must have been available before the freeze.

`recordId`, `snapshotId`, `inputRevision`, `modelVersion` and `schemaVersion` are mandatory identities. They are declared provenance: the harness cannot authenticate them, check a hash against archived contents, prove that all relevant evidence was listed, or detect deliberate backdating. A trusted, access-controlled immutable archive must bind these identities to the actual pre-race inputs/output, model version/training manifest and creation timestamp. It must preserve later corrections as new versions. Merely constructing an object with an earlier date is not a frozen pre-race prediction.

Do not reconstruct a missing pre-race target from the final result or a post-race activity. Report the missing snapshot/evidence as an abstention or protocol exclusion. Keep realized-power/weather mechanics diagnostics in a separate experiment from prospective-information replay; the former must never be reported as pre-race predictive performance.

## Pseudonymous paired-record format

The following is entirely fabricated and illustrates the same shape a separately authorized real-data study would use. It is not an athlete export. Each record represents one athlete/event edition and one preregistered prediction horizon. `eventStartAt` must use the start instant corresponding to the declared chip/gun elapsed basis. Do not put names, account IDs, public athlete-result URLs, medical details, or raw GPS tracks in these fields.

```json
{
  "record": {
    "schemaVersion": "race-evaluation-v1",
    "recordId": "synthetic-record-001",
    "snapshotId": "synthetic-snapshot-001",
    "inputRevision": "synthetic-inputs-v1",
    "modelVersion": "synthetic-model-v1",
    "timeBasis": "chip_elapsed",
    "athleteId": "synthetic-athlete-a",
    "eventId": "synthetic-event-edition-a",
    "cohortId": "synthetic-road-10km-24h",
    "eventStartAt": "2026-05-10T08:00:00Z",
    "cutoffAt": "2026-05-09T08:00:00Z",
    "frozenAt": "2026-05-09T08:00:00Z",
    "evidence": [
      { "id": "synthetic-target-and-inputs-v1", "availableAt": "2026-05-08T08:00:00Z" },
      { "id": "synthetic-model-artifact-v1", "availableAt": "2026-05-01T08:00:00Z" }
    ],
    "estimatedElapsedSeconds": 3600,
    "abstentionReason": null
  },
  "outcome": {
    "athleteId": "synthetic-athlete-a",
    "eventId": "synthetic-event-edition-a",
    "status": "finished",
    "elapsedSeconds": 3700,
    "timeBasis": "chip_elapsed",
    "availableAt": "2026-05-11T08:00:00Z",
    "sourceId": "synthetic-official-result-v1"
  }
}
```

Real pseudonyms must be stable across events, folds and versions; remapping one person to different IDs defeats athlete-level holdout. Event IDs must identify the same edition for all athletes and change between editions. Keep the linkage key separately with authorized access and retention controls. Pseudonymization is not anonymization; dates and event context may still identify someone. Collection, processing and any transmission need their own approvals. Public race results are not blanket permission to collect health/training records or scrape identities. Do not commit real study data to this repository.

Keep a separate restricted study manifest for distance, sport, terrain, official course revision, conditions, forecast horizon, device/protocol, evidence quality, planned-versus-realized execution, route changes, stops, sensor gaps, consent and exclusions. These facts belong in the preregistered cohort definition and audit, not inferred from the score. A fixed forecast horizon is a caller/protocol requirement: the current contract does not calculate or enforce a uniform horizon. Use separate cohort IDs/calls for different horizons or populations and verify their definitions before analysis.

## Outcomes, exclusions and arithmetic

- `finished` requires a source, a finite elapsed duration and an availability timestamp no earlier than event start plus observed elapsed time. `chip_elapsed` and `gun_elapsed` cannot be mixed. Moving time is unsupported.
- `dnf` and `dns` have a null finish duration. DNF availability cannot precede the start; DNS may be known before the event. Neither is assigned an invented finish time. Keep partial splits or retirement details in the separate restricted manifest.
- `missing` may be explicit with null fields or result from an absent join. It is always counted and excluded from finish-time metrics. A present but malformed outcome is also explicitly excluded.
- An estimate of null requires a nonempty `abstentionReason`, which is retained in the report. An unreasoned null, nonfinite number, invalid timestamp, version mismatch or conflicting duplicate is not silently dropped or coerced to zero.
- Arithmetic duration bounds are 0.001 seconds through 366 days. These avoid numerical underflow/overflow and match timestamp precision; they are not physiological limits, validated eligibility criteria, or evidence that an extreme estimate is sensible. Register appropriate cohort-specific constraints separately.

The report includes submitted-record/outcome counts, scored and excluded records, DNF/DNS/missing/ambiguous status counts, overlapping exclusion-reason counts, the complete record ledger and unmatched outcomes. Reason counts can sum to more than the excluded count because one record can have multiple defects. Counts refer to submitted records, not independent athletes; report distinct athlete/event counts separately in any real study. Inspect unmatched and duplicate outcome records before drawing cohort conclusions.

For eligible finished records only, error is **estimate minus observed elapsed seconds**. Positive bias means slower estimates; negative bias means optimistic/faster estimates. Metrics are mean absolute error in seconds, mean signed bias in seconds, median absolute percentage error (`100 * absolute error / observed elapsed`), nearest-rank P90 absolute error (`ceil(0.9 * n)` in sorted errors), and maximum absolute error. Even-sample medians average the two middle values. There is no interpolation for P90. No eligible finishes yields `metrics: null`, never an invented zero.

DNF/DNS/missing/abstention records remain in the enrollment/exclusion ledger but are not part of the numerical finish-error denominator. Publish both denominators and failure/abstention rates beside the finish-only metrics. These error summaries must not be read as an all-enrolled success rate. P90 is an error-distribution summary, not a calibrated confidence or prediction interval.

## Preregistered holdout and calibration requirements

Before inspecting held-out outcomes, register and freeze:

1. **Question and population.** Start separately with nontechnical road running and solo cycling time trials. Specify sport, distance/duration, terrain, conditions, horizon, elapsed-time basis, supported evidence and all inclusion/exclusion rules. Treat swimming, technical trail, pack racing and triathlon as separate unvalidated populations. Log exclusions and reasons, including unfavorable outcomes; do not remove a difficult result because it worsens the score.
2. **Comparators and endpoints.** Freeze simple target arithmetic, nearest comparable prior race, appropriate-domain generic distance scaling, or a flat/no-wind cycling baseline, plus any ablations. Define a primary metric, minimum useful improvement, unacceptable tail/stratum degradation and a release decision rule with product and qualified domain reviewers. No threshold or sample size is supplied by this scaffold. Determine sample size from precision and independent-athlete/event variability.
3. **Partitions and chronology.** Reserve entire athletes for population-generalization testing. For returning-athlete evaluation, use only earlier available training labels at each rolling origin. Reserve a final chronological test period that is never used for feature choice, parameter fitting, threshold tuning, calibration or model selection. Freeze and version the athlete lists, event dates and training/calibration/test manifests; account for multiple entrants in the same event. Outcome availability, not merely event date, determines eligibility. The holdout helper alone does not create calibration/test folds or enforce event-cluster separation across a study.
4. **Uncertainty and strata.** Report all registered strata, including weak results, by sport, duration, terrain, heat, wind, forecast lead time and evidence quality. Report sample counts, missing/abstention rates, signed/absolute errors and tail errors. Uncertainty estimation must account for repeated races by the same athlete and shared event conditions; individual splits are not independent participants. Clustered uncertainty calculations and significance tests are outside this implementation.
5. **Calibration.** Any future probabilistic interval must be fitted/calibrated using only earlier training or a separate calibration partition, then evaluated on untouched future outcomes. Register nominal coverage, interval width, stratum coverage and tolerable deviation in advance. In-training residual scale or a selected symmetric percentage is not out-of-sample calibration. This harness intentionally does not score sensitivity bands as probabilistic intervals or fit/calibrate a model.
6. **Prospective confirmation.** After retrospective selection, freeze a new version and collect genuinely pre-race estimates for subsequent consented races. Preserve intended-versus-realized execution so adherence, weather/input error and mechanics error can be examined separately. Publish the protocol, limits, residuals, exclusions and failure rates. Any tuning after unblinding starts a new version and requires a new untouched evaluation period. Keep scenario-only product claims until independent prospective evidence satisfies the registered criteria.

## Verification and limitations

Run `node --import tsx --test src/lib/race-evaluation.test.ts` for the focused synthetic checks. The repository's existing `npm test` glob discovers this file automatically. Run `npx tsc --noEmit --incremental false` for type checking without a generated incremental artifact.

Tests cover known arithmetic, empty samples, nonfinite/underflow inputs, missing/unfinished outcomes, duplicate joins, immutable-input behavior, invalid dates and timezone offsets, post-freeze evidence, same-instant boundaries, athlete holdout and rolling-origin label availability. These tests verify implementation behavior under invented inputs. They do not validate a physiological model, demonstrate sustainable targets, establish real-world accuracy, provide empirical interval coverage, verify identity/consent, or replace held-out and prospective real-race evaluation.
