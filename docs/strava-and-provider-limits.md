> **CTO audit update — 2026-10-20:** Official COROS documentation now describes MCP workout/plan creation and editing for running and cycling. The earlier read-only characterization below is superseded. That provider capability is not a verified JMM integration: OAuth registration, token handling, consent, per-athlete acceptance and device confirmation remain necessary. Unknown file manufacturers/authors now stay `uploaded_unknown`; CSV distances require explicit metric/imperial units. All direct uploads are limited to 4 MB.
> Sources: [COROS official MCP update log](https://coros.com/stories/coros-metrics/c/mcp-testing), [Vercel request limits](https://vercel.com/docs/functions/limitations), [Strava API agreement](https://www.strava.com/legal/api).

# Provider limits, import verification and what is deliberately not done

Branch `feat/jmm-connectivity-smart-coach`, written 2026-10-20. Nothing here was deployed, no OAuth/security setting
was changed, no credential was created or tested, and no real athlete message was sent.

## 1. Strava

**Policy (summarized from Strava's published API Agreement, effective 2026-06-01; the owner or counsel should confirm
the wording, this is not legal advice).** Strava data and data derived from it may not be used for AI/ML purposes
(including being placed in a model's context window), may not be kept indefinitely in vector stores, and may only be
shown to the athlete it belongs to. The restriction follows the data when another service relays it.

**What the code does now**

| Rule | Where | Test |
|---|---|---|
| One decision function `provenanceOf(row)` → `allowed` / `strava` / `unknown`. It is a **whitelist of known non-Strava origins**; unknown is treated like Strava (restricted). | `src/lib/strava-provenance.ts` | `strava-provenance.test.ts` (12) |
| Intervals.icu relays Strava with `Original source: STRAVA`; that upstream is read from the stored note and restricted. | same | same |
| A Strava-exported TCX/FIT file is detected from its metadata and stored as origin `tcx`/`fit` with the note `Original source: STRAVA (file export)` instead of being laundered into "garmin". | `tcx-import.ts`, `fit-import.ts` | `import-files.test.ts` (26) |
| Stream analysis, next-workout suggestions and the stream store refuse Strava-origin and unknown-origin activities **before reading any data**. | `stream-analysis.ts`, `activity-stream-store.ts`, `api/activity-analysis`, `api/workout/next-suggestion` | `stream-analysis.test.ts`, `activity-stream-store.test.ts` |
| The athlete-facing setup screen states only what is enforced (Strava activities are kept for the athlete's own records; JMM's AI features do not receive them). | `STRAVA_AI_NOTICE`, `setup-paths.tsx` | `athlete-setup-paths.test.ts` (17) |

**Not done, needs an owner/legal decision.** Older local analytics (training-load charts, legacy summaries computed
from stored workouts) still include Strava-origin rows. AI paths already excluded them (`api/coach`,
`coach-personal-context`). Whether non-AI local load maths on Strava rows is acceptable under the agreement is a legal
question; excluding them would change athletes' load numbers (a safety-relevant trade-off), so it was not changed.

## 2. COROS

Two official routes exist (see also `docs/coros-direct.md`, verified 2026-10-09):

| Route | Access | Fit for JMM |
|---|---|---|
| COROS MCP (OAuth 2.0) | Permitted without partner approval; per authorizing user; reads are polled (no webhooks). | Provider documents athlete-authorized reads plus running/cycling workout and plan creation/editing; JMM adapter is not externally verified. |
| COROS Partner API | Application by email to api@coros.com; manual approval; documented rate limits, webhooks, workout push. | The route for scheduled workout delivery; requires COROS approval. |

**Status: BLOCKED for adapter completion.** The repository keeps COROS writes hard-gated
(`ENABLE_COROS_CONNECTOR`, issuer pinning, client id and encryption key must all be configured). Completing a COROS
adapter needs a client registration/credentials, which this task was not allowed to create. Owner steps: choose the
route; for MCP register a public OAuth client through COROS' dynamic registration with the production redirect URI
and set `COROS_CLIENT_ID`/`COROS_ISSUER`; for the Partner API email api@coros.com. Until then COROS athletes use the
file import (TCX/FIT) and follow the JMM workout screen. Check device-specific file compatibility; a FIT download alone does not establish COROS workout import support.

## 3. Garmin

Manual import only, as specified: the athlete exports from Garmin Connect and uploads the file. No Garmin Health /
Connect IQ API is used. "Export Original" yields a ZIP containing the `.fit`; ZIPs are **refused with an explanation**
(unzip first) because no archive reader was written. The setup screen never shows Garmin as "connected" or "delivered".

## 4. Intervals.icu

Conditional: shown only when the deployment actually has the connector. Publication receipts are revision-bound and
always carry `deviceReceived: false` (Intervals accepting a workout is not a watch receiving it).

## 5. Importer verification (what is verified, what is not)

Verified with **synthetic fixtures only** (no real athlete export was available): `src/lib/import-files.test.ts` (26).

| Input | Verified | Not verified / refused |
|---|---|---|
| TCX | Real XML parser (replaced regex). All laps' calories summed (was first lap only). Duration = lap timer time (was an invented 1 minute for a one-point file). Streams extracted. DOCTYPE/ENTITY rejected. Strava-marked files recorded as Strava-origin. | Device-specific TCX dialects from real Garmin/COROS/Strava exports. |
| Garmin `Activities.csv` | English headers; quoted commas/newlines/quotes, BOM, CRLF. Dates are interpreted in the **athlete's** timezone (was the server's, which moved early-morning activities to the previous day). Decimal-comma numbers become *unknown* (`54,09` was previously read as 5409 km). Walking/hiking no longer imported as running. One bad row no longer aborts the import. | **Non-English headers are refused, not guessed** (the old importer silently imported 0 rows). Aliases must be added from a real Spanish export. |
| FIT (activity) | Garmin's official SDK; size cap, header, CRC, decode errors, file type must be `activity`; GPS never read. Built and decoded with the SDK's encoder in tests. | Real device files (developer fields, multisport chains). |
| ZIP | Refused with a message (not silently ignored). | Archive reading. |

Behavior changes athletes will notice (also in the release notes): walking is no longer stored as running; TCX duration
is timer time; non-English CSV is refused with instructions; calories/duration/dates in old rows are corrected on
re-import (same `externalId`, so re-importing updates instead of duplicating).

**Body-size flag.** The upload UI allows 40 MB; Vercel's documented request-body limit for serverless functions is
4.5 MB. Files above that fail at the platform before reaching the route. Not verified live; either lower the UI cap or
use direct-to-storage upload. Not changed here.

## 6. Outgoing artifacts and channels (tested separately, as asked)

`src/lib/outgoing-artifacts.test.ts` (7) and `src/lib/delivery-contract.test.ts` (9): calendar events (ICS) are not
watch workouts; a download is not device delivery; FIT/ICS/ZIP are tested as separate artifacts; the single approved
revision gates email, Telegram and Intervals; stale or cancelled revisions are never redistributed. The email and
Telegram **orchestration** needs the database (BLOCKED here, see report); only mock transports were ever used.
Known gap: there is no Telegram "withdrawn" notice when an approved workout is cancelled/changed after sending (email
has revision notices). Documented, not built.
