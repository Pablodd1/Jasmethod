# Reviewed Garmin file import

The Connections page reviews a local activity file before an athlete explicitly saves it. Preview and cancellation do not save activity history. A file import does not replace a training cycle, infer training thresholds, change consent, or send messages.

## Supported files and limits

- **Activities-list CSV**, exported from Garmin Connect → Activities → All Activities → Export CSV. This is distinct from **Reports**, which can contain aggregated categories or time periods. The report at `/app/report/16/all/last_year` has not supplied a validated schema; it is not assumed to be an activity list or all account data.
- **TCX activity XML** with valid activity/lap summaries and timezone-qualified timestamps. Trackpoint-only guesses, incomplete totals and unsafe XML are rejected.
- UTF-8 text, maximum **10 MiB**, at most **1,000 accepted activities per preview/confirmation**. Export smaller date ranges where needed. Deployment ingress limits can be lower than the application limit.
- FIT and ZIP/archive inputs are explicitly unsupported. Binary signatures are checked even if the filename is changed. Archives are never expanded on the server.

The official FIT SDK is already installed for other application functionality. Adding a reliable FIT activity importer needs a separate bounded decoder, CRC/type checks, multisession handling, validity/unit/provenance checks and fixtures. A complete-account ZIP also needs archive traversal, compression-bomb and nested-file limits. Neither capability is claimed by this repair.

Official export reference: https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8

## File options

For CSV, confirm the export's timezone and unit system. These describe the **file**, not the app's display preferences. Do not guess from the athlete's language or distance magnitude.

- Recognized English/Spanish Activities column names, comma-delimited quoted CSV, ISO local dates (`YYYY-MM-DD HH:MM[:SS]`) and elapsed `HH:MM:SS` durations are supported. Arbitrary report schemas, semicolon-delimited files and ambiguous slash dates are rejected.
- Run/bike distances without labels use explicitly selected kilometres/miles. Swimming distances without labels require their own explicit unit. Unmapped sports with unlabelled distance also require an explicit distance unit.
- Decimal/grouping separators require the corresponding numeric format selection. Explicit header/cell units take precedence; contradictions reject the row.
- Missing optional measurements stay missing. Walking is retained as `other`, never running. Unknown sports are not inferred from physiological data.
- Local DST gaps/overlaps reject ambiguous rows. An explicit UTC offset or TCX export can resolve the ambiguity.
- Durations are stored as nearest whole minutes (minimum one for positive duration); original seconds are retained in the bounded import audit receipt. Fractional integer-backed heart-rate/calorie values reject rather than fail during storage.

## Preview and confirmation

The preview distinguishes new, updated, duplicate, skipped and rejected records, shows coverage for accepted file records, and never labels this complete account history. A sample displays up to 100 activity rows; totals cover the parsed file. Mixed valid/invalid files can save only the explicitly reviewed valid new/updated rows.

The confirmation binds the signed-in athlete, file bytes/name, normalization choices and current relevant stored history. Changes require a fresh preview. Identical retries after an interrupted response return the durable receipt instead of writing twice. Files/tokens are not retained in persistent browser storage; raw files are not stored on the server.

- Same uniquely identified Garmin file activity: only supplied imported metrics can update. Notes, explicit feedback, prescriptions and plan links are not overwritten. Explicit-feedback rows are protected.
- Legacy file identifiers are checked as aliases. A prior timezone error is flagged as a conflict, not silently moved or duplicated.
- Approximate/cross-provider matches are conservatively duplicate/skipped, never automatic enrichment. Multiple matches require review.
- A same-sport performed planned session on the athlete-local day prevents a new imported row from silently double-counting it. Uncompleted plans remain unchanged; importing does not automatically complete them.

Each successful confirmation records bounded counts, coverage, normalization choices and source-duration evidence in the athlete-scoped audit trail. No provider authorization or delivery is performed.

## Administrative entry points

The legacy `scripts/import-garmin-csv.cjs` direct database writer is retired with a clear migration message. It cannot read a file, credentials or database. Use the authenticated Connections flow to save records.

For offline inspection only, use `node --import tsx scripts/preview-garmin-file.ts --help`. The preview CLI uses the same bounded parser and never reads database credentials or saves data.

## Verification

Synthetic unit, database/HTTP and mobile-browser checks cover units/languages, DST, malformed files, duplicate/repeat/concurrent confirmation, interrupted navigation/save, protected history/consent and no outbound delivery. The HTTP/DB runner is included in GitHub CI. Run the isolated `scripts/jmm-garmin-import-local-run.sh start` after a production build with the documented PostgreSQL/browser prerequisites in that runner.

Physical phones, real Garmin exports from a signed-in account, report 16's actual file, production athlete imports and device delivery are not certified by these local tests. No production migration is required by this change, and no merge/deployment is included in the publication request.
