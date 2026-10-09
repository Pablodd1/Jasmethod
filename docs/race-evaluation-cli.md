# Offline race evaluation CLI

This command imports externally prepared frozen estimates and outcomes, checks their JSON shape, and runs the existing evaluation arithmetic. It never fetches athlete data, contacts a provider, writes a database, fits/calibrates a model, or enables `forecastRace()`. A successful command means a report was calculated, **not that JMM is validated**.

Read [the evaluation protocol](research/race-scenarios/evaluation-protocol.md) before preparing records. Real records need separate consent, pseudonymization, immutable pre-race archives, and a registered cohort/horizon. The tool checks declared chronology; it cannot authenticate timestamps, verify consent, or establish that the estimates were actually frozen before the event. Keep real inputs and reports outside this repository.

## Run

```sh
node --import tsx scripts/race-evaluate.ts --input /restricted/study/input.json --output /restricted/study/new-report.json
```

Omit `--output` to print JSON to standard output. Errors go to standard error and exit with code 1. `--help` prints usage. An empty or fully excluded sample produces `metrics: null`. Inspect counts, exclusion reasons, row ledger, and unmatched outcomes before interpreting metrics. Exclusion counts overlap and may exceed the excluded-record count. P90 absolute error is a nearest-rank summary, not an uncertainty interval.

The command refuses to replace any existing output, including a symlink/hard-link alias of the input. Choose a new output filename for each evaluation. Created report permissions are requested as `0600`; parent-directory permissions and host access controls remain the operator's responsibility. Standard output/redirection does not provide this file protection. Reports retain submitted pseudonyms, dates in unmatched outcomes, and abstention text; they are study data, not automatically safe to publish.

## Input envelope

The top-level JSON object must contain **exactly** `options`, `records`, and `outcomes`. Every record/outcome has exactly the fields specified by the existing contract. Unknown fields are rejected to avoid silently discarding study metadata; keep the separate study manifest outside this file. No implicit conversions or defaults are applied.

```json
{
  "options": {
    "dataKind": "synthetic",
    "modelVersion": "synthetic-model-v1",
    "cohortId": "synthetic-road-10km-24h",
    "timeBasis": "chip_elapsed"
  },
  "records": [],
  "outcomes": []
}
```

For a populated example, use the wholly fabricated record/outcome pair in the protocol: put its `record` in `records` and its `outcome` in `outcomes`. Match model, cohort and time basis in the options. Do not generate fabricated samples as evidence of athlete prediction accuracy.

Supported values:

- `dataKind`: `synthetic` or `consented-pseudonymous`. The latter is an operator declaration, not verified consent.
- Record schema: `race-evaluation-v1`.
- Time basis: `chip_elapsed` or `gun_elapsed`; moving time is unsupported.
- Outcome status: `finished`, `dnf`, `dns`, or `missing`.
- Nulls must be explicit where allowed (`estimatedElapsedSeconds`, `abstentionReason`, outcome `elapsedSeconds`, `availableAt`, `sourceId`).

Shape failures reject the entire import without a report. Semantic failures such as invalid dates, nonpositive duration, missing evidence, post-freeze evidence, conflicting duplicate identities, and missing outcomes remain in the existing exclusion ledger. The tool does not infer sources, repair timestamps, select the best snapshot, or discard difficult results.

Input limits: regular UTF-8 JSON file at most 10 MiB; at most 10,000 records and 10,000 outcomes; at most 1,000 evidence entries per record; at most 2,048 characters per string. These are operational limits, not physiological eligibility rules. Errors show field paths rather than supplied values. Supply appropriately restricted local paths; no URLs are supported.

## Verification

```sh
node --import tsx --test scripts/race-evaluate.test.ts src/lib/race-evaluation.test.ts
npx tsc --noEmit --incremental false
```

CLI tests use fabricated records in temporary directories and cover known MAE/bias/P90 arithmetic, retained exclusions, explicit unvalidated labels, malformed nested input, UTF-8/JSON rejection, file-size bounds, flag handling, and overwrite protection. They establish software correctness for those cases. They do not establish real-athlete error, interval coverage, or prospective validity.
