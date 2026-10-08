# Race scenario workspace

Implementation candidate, 8 October 2026. This is an experimental execution-planning tool, not a validated finish-time predictor, medical prescription or release approval.

## User flow

1. Open **Races → Plan race scenarios**. Search your saved events by name/date/location, or describe a new event and link its official edition page. Confirm the venue, date, start instant with UTC offset and IANA time zone. A saved venue is not independently verified as the start line. No worldwide authoritative event registry is claimed.
2. Review real dated sport-specific benchmark records, or enter a recent manual baseline with source, protocol and context. Undated legacy profile values stay context-only. A selected target is explicit and separate from observed capacity; FTP is not converted to sustainable race watts, and a 5 km result is not scaled automatically into marathon ability.
3. Import an organizer GPX file for each relevant leg, or enter signed course sections. Inspect elevation coverage, climb/descent and gaps. GPX-derived geometry is an estimate, not a certified official route. Missing elevation never becomes a flat course. A flat/zero-axial-wind assumption requires confirmation.
4. Retrieve weather explicitly, or enter manual conditions. MET Norway supplies current forecast samples only within its actual returned coverage. NASA POWER supplies the prior five completed years' same-season daily conditions, with actual coverage counts; it is regional reanalysis, not race-hour weather. Date/venue edits invalidate applied provider context. Saved weather is a user-reviewed copy of the provider reference; its consistency is checked, but values are not independently re-fetched or certified on save. Historical or manually selected conditions stay visibly distinct from a forecast.
5. Select sport-specific execution assumptions and practiced HR/running watts if available. Cycling uses explicit total system mass, drag, rolling resistance, air density and drivetrain efficiency. Running grade-to-pace mapping is labeled an additional unvalidated field assumption. Wind is signed axial wind per section, never silently inferred from a forecast wind magnitude. No automatic heat, altitude or acclimation penalty is applied.
6. Preview segment/leg timing, pace, target power versus required power, mechanical work and optional metabolic-energy sensitivity. Missing inputs give reasons instead of estimates. Compare selected time-sensitivity ranges; they are not calibrated confidence intervals.
7. Review a separately dated, tolerated carbohydrate practice rate. Multiplication by modeled feeding-window duration creates logistics totals, not carbohydrate oxidation or calorie requirements. Swim and transitions are excluded from modeled feeding windows. No grams are derived from mechanical kJ.
8. Save an immutable scenario snapshot. Reload it for a new edit or compare saved snapshots. Changing inputs immediately invalidates current preview/save. Changes to reference evidence or model version label old snapshots stale. The tool does not change athlete capacity, training plans, safety check-ins or device prescriptions.

## Architecture and safety

- `race-scenario.ts`: strict reconstructing parser and deterministic model; versioned inputs and results.
- `race-course.ts`: bounded GPX 1.0/1.1 parser; rejects entities/DOCTYPE, ambiguous multi-route files, invalid coordinates, absent elevation and unsupported whole-course gaps. Geometry is computed before display decimation. Conversion distinguishes horizontal from along-path metres.
- `race-weather.ts`: fixed-provider server-only adapters with bounded payloads/timeouts, caching and upstream provenance. Only event coordinates reach providers; no athlete identifiers, biometrics, notes or race names are transmitted.
- `race-scenario-evidence.ts`: athlete reference display and explicit 90-day product review window; the review window is not empirical proof of physiological validity.
- `race-scenario-metadata.ts`: bounded context and safe source-link validation. An official URL is user-attested, not remotely verified; source URLs are not fetched by the application.
- `race-scenario-store.ts`: existing athlete-scoped immutable AuditLog rows (`race.scenario`), no new table or production migration.
- `/api/race-scenarios`: authenticated private/no-store reads and serializable optimistic-revision saves. Output is recomputed server-side. Saved anchor/race IDs are resolved against authorized athlete scope.
- `/preview`, `/course`, `/weather`, `/history`: authenticated bounded read/compute endpoints; no race/profile mutation or outbound notification.
- Existing personalized forecast APIs remain disabled by `forecast-availability.ts`. This workspace does not remove their validation gate. Prior nutrition, double-day and clinical/safety gates remain unchanged.

## Provider operation and attribution

MET Norway uses a genuine identifying User-Agent, defaulting to the public application repository URL. `RACE_WEATHER_USER_AGENT` can override this with the operator's real contact; no credential is required. Use the provider's returned coverage/expiry and preserve `Based on data from MET Norway`, source and CC BY 4.0 links with transformation description. The service has no SLA.

NASA POWER requires no key and permits commercial use; retain NASA POWER/MERRA-2 attribution, local-solar daily time basis, coarse-grid limitation, 10 m wind height, per-field counts and actual baseline years. Historical weather never automatically replaces future forecasts. See [integration research](research/race-scenarios/data-integrations.md) and [history schema](research/race-scenarios/history-integration.md).

The old races endpoint no longer silently geocodes or calls the non-commercial Open-Meteo public API. Users retain saved race data and can explicitly request licensed enrichment in the workspace. No provider account, credential, production configuration or subscription was created.

## Verification

Unit tests cover arithmetic, model missing-input gates, signed grades and wind, power/work consistency, source integrity, date/metadata validation, GPX bounds and weather schema/horizon/history failures. `scripts/jmm-race-scenario-integration.ts` uses only disposable localhost PostgreSQL and synthetic accounts; it covers authentication, cross-athlete IDs, server recomputation, concurrency conflicts, immutable snapshots, source changes and unchanged legacy gates. It is part of PR CI.

Numerical regression tests do not establish predictive accuracy. Validation with held-out real races, coaching/scientific review, official edition verification and production release authorization remain separate. No merge or deployment is included in this implementation task.
