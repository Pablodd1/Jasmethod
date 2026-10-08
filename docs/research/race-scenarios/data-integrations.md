# JMM race scenario: data integration decision

Research verified 2026-10-08. This is an implementation recommendation, not legal advice. No accounts, API keys, purchases, or external uploads were created. Companion contract: `adapter-contracts.md`.

## Ship recommendation

1. Ship manual race/edition/date/local-start/timezone/location entry and GPX import as complete first-class paths. They work worldwide without pretending a race database exists.
2. For live near-term weather, use a server-side MET Norway Locationforecast adapter with caching, genuine app identification, and required visible attribution. No account/key is needed. Enable only when the server has a real contact identity and can meet the policy below.
3. For city search, a locally hosted GeoNames gazetteer is a viable commercial-use, no-account data option; it is **city lookup, not race discovery or exact venue lookup**. Manual coordinates remain available. An already authorized GeoNames username could enable its service, but do not create an account or use the demo account.
4. Elevation comes first from imported GPX or organizer-published figures. A hosted DEM is a later optional adapter. The public Open Topo Data service is documented for testing; don't promise it as an unlimited production dependency.
5. Outside forecast coverage, show “Weather not yet available” alongside the separately labeled NASA POWER past same-period summary (see `history-integration.md`). Do not substitute historical values and call them a forecast. NASA POWER was subsequently verified as a lawful no-key global history route and is implemented with actual five-year daily seasonal windows.
6. Preserve small, visible mandatory data credits even though normal product copy uses no provider/company names. It is not a reason to block otherwise lawful functionality.

## Provider facts and deployment rules

### MET Norway: recommended no-key forecast

The documented `/weatherapi/locationforecast/2.0/compact` endpoint accepts `lat`, `lon`, and optional integer `altitude` (ground meters above/below sea level). Its documented horizon is nine days; other model descriptions reference ten days. Treat the actual returned timestamps as authoritative. Current forecast API does not supply worldwide historical forecasts. [Official endpoint documentation](https://api.met.no/weatherapi/locationforecast/2.0/documentation)

Use HTTPS; genuine identifying User-Agent with application/domain and contact; coordinates truncated to no more than four decimals; shared cache; respect `Expires`; revalidate using the exact `Last-Modified` value in `If-Modified-Since`. More than 20 requests/second application-wide needs agreement. Handle 203 deprecation, 304 cached response, 403 policy/configuration failure, and 429 backoff. No SLA. A backend proxy avoids exposing athlete IP addresses to the provider. [Terms](https://api.met.no/doc/TermsOfService)

Data is under CC BY 4.0/NLOD 2.0 unless otherwise marked. Display “Based on data from MET Norway”, link source and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and indicate transformations such as race-window aggregation. Don't imply endorsement. Avoid their icons unless their separate MIT notice is included. [License](https://api.met.no/doc/License)

Recommended startup configuration: `WEATHER_PROVIDER=met`, `WEATHER_CONTACT_URL=<real public contact page>`; fail closed to manual weather if identity is absent. No fabricated User-Agent contact. Use a low internal request budget, deduplication, and bounded retry with jitter. Never retry 403 under a fake identity. [Client implementation guidance](https://api.met.no/doc/locationforecast/HowTO)

### GeoNames: city lookup, not event lookup

Commercial use is allowed with attribution. Downloadable country/world gazetteers support a private local search index. Hosted service has 10,000 credits/day and 1,000/hour per application. [Data/services terms](https://www.geonames.org/export/)

A hosted service request requires a username. The `demo` account is explicitly forbidden for apps and tests. Do not acquire credentials in this task. [Service documentation](https://www.geonames.org/export/web-services.html)

For a no-account index, use a city extract plus administrative names, retain a dated snapshot and source credit. UTF-8 tab-separated rows include `geonameid`, `name`, `asciiname`, `alternatenames`, `latitude`, `longitude`, `country code`, administrative codes, `elevation`, `dem`, `timezone`, `modification date`. `timezone` is IANA. A populated-place extract omits some rural race venues, so maintain manual entry. [Dataset format](https://download.geonames.org/export/dump/readme.txt)

### Do not silently enable these defaults

- **Public Nominatim:** no autocomplete; aggregate maximum 1 request/second; identifying header; attribution; cache; provider must be switchable. Its current policy expressly disallows generic place-search services generated/offered through no-code/low-code/vibe-coding platforms absent the prescribed deliberate developer responsibility. Do not build this default into JMM. Self-hosted or commercial Nominatim instances have different policies. [Usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- **Open-Meteo free hosted API:** non-commercial only, including restrictions on commercial/promotional apps; 600/minute, 5,000/hour, 10,000/day, 300,000/month. Data licensing and hosted-service permission are distinct. [Terms](https://open-meteo.com/en/terms)
- Paid Open-Meteo access would provide commercial permission but still requires attribution. Historical/climate/ensemble access requires Professional or above. Do not subscribe or obtain a key. Self-hosting also entails software/data license obligations. [Pricing/licensing](https://open-meteo.com/en/pricing)
- **Open Topo Data public API:** testing service, 100 locations/request, 1 request/second, 1,000/day. Self-hosting needs separately verified dataset licensing and operational capacity. Global labels do not imply uniform resolution or accuracy. [Public service limits](https://www.opentopodata.org/)

## Exact upstream schemas

### Recommended forecast

Request shape (illustrative public coordinates, not a real race):
`GET https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=60.1&lon=10&altitude=267`

Read these exact paths:
- `geometry.coordinates`: `[longitude, latitude, altitude]`
- `properties.meta.updated_at`: UTC ISO timestamp; use as provider update time, not necessarily model initialization
- `properties.meta.units`: variable/unit dictionary
- `properties.timeseries[].time`: UTC ISO timestamp
- `properties.timeseries[].data.instant.details.air_temperature`
- `...relative_humidity`, `...wind_speed`, `...wind_from_direction`, optional `...wind_speed_of_gust`
- `properties.timeseries[].data.next_1_hours.details.precipitation_amount` or `next_6_hours`; retain interval duration
- `...next_1_hours.summary.symbol_code`, when present

Time spacing varies; the final instant may have no period values. Never sum overlapping 1/6/12-hour periods. [JSON structure](https://api.met.no/doc/ForecastJSON)

Temperature is Celsius, humidity percent, wind m/s from a compass direction, rain mm over its stated interval. Global models are comparatively coarse around complex terrain; not every variable/period exists everywhere. The forecast is ground-level weather, not athlete-level wind or heat exposure. [Data model](https://api.met.no/doc/locationforecast/datamodel)

### Optional Open-Meteo contracts, disabled without eligible deployment

Geocoding `/v1/search?name=…&count=…&language=…&countryCode=…` returns `results[]` with `id`, `name`, `latitude`, `longitude`, `elevation`, `timezone`, `country_code`, `country`, `admin1`–`admin4`; empty optional fields can be omitted. This finds places, never a verified edition. [Geocoding schema](https://open-meteo.com/en/docs/geocoding-api)

Forecast `/v1/forecast`: `latitude`, `longitude`, `hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m`, `wind_speed_unit=ms`, `timezone=UTC`, `forecast_days=16`. Response uses `hourly.time` and parallel variable arrays with `hourly_units`, plus latitude/longitude/elevation/timezone metadata. Validate array alignment/nulls. Default is seven days; maximum up to sixteen, model-dependent. `timeformat=unixtime` yields UTC seconds. [Forecast documentation](https://open-meteo.com/en/docs)

### Optional elevation adapter

`GET /v1/<dataset>?locations=<lat>,<lon>|<lat>,<lon>&interpolation=bilinear&nodata_value=null`
Response `status`, optional `error`, `results[]` in input order; each result has `elevation`, `location.lat`, `location.lng`, `dataset`. Elevation units/datum follow dataset. Null means missing/outside coverage, never zero. Use batched requests, not one request per GPX point. [API schema](https://www.opentopodata.org/api/)

## Race matching and provenance: product rules

No verified universal free event-calendar/course API was established in this research. Do not represent a small hand-entered list or location geocoder as worldwide automatic race discovery.

- Race identity must include name, organizer/official URL, edition/date, country/region/venue, and discipline/distance variant. Multi-distance events need separate course selection.
- Search results remain candidates until confirmed. Show edition, date, place, distance, and source together; no automatic first-match selection.
- Date/course evidence should come from the organizer's current edition. Store each field's URL and retrieval date. A directory/search snippet is a lead, not official verification.
- Importing a GPX does not prove official course status. Ask “Is this the course for this edition?” with options for official course, user route, or unverified. Persist the answer. Keep organizer-published distance/ascent separate from calculated geometry metrics.
- Do not fetch arbitrary pasted URLs server-side without SSRF protection, redirects/DNS checks, host allowlists or equivalent safe fetch controls. A local file upload is the safer initial implementation.
- No route available: allow distance, ascent, descent, surface and altitude as assumptions; mark route shape/grade/climb placement unknown. Never draw a fake profile or derive max grade from total climb.

## GPX and elevation processing: proposed reproducible v1

GPX 1.1 supports `trk/trkseg/trkpt` and `rte/rtept`; points require lat/lon, elevation is optional. Copyright/source metadata may exist. Preserve track segments; don't silently connect gaps. [GPX schema](https://www.topografix.com/GPX/1/1/)

The following thresholds are JMM engineering defaults to validate, not a scientific universal standard:

1. Parse locally with external entities/DTDs disabled; cap bytes and point count; reject malformed XML, nonfinite values and invalid coordinate ranges. Strip HR/power/cadence/athlete identifiers/timestamps from retained course data unless independently required and authorized. A training GPX can reveal private routes.
2. Select track/route explicitly when multiple exist. Preserve original coordinates and a file SHA-256; keep gaps explicit. Ignore duplicate zero-distance points in grade calculations. Longitude crossings need antimeridian-safe distance handling.
3. Compute cumulative horizontal geodesic distance, not 3D distance, for grade. Preserve supplied elevation and its provenance; record any DEM replacement and vertical datum separately.
4. For sufficiently dense, contiguous data, resample along distance at 25 m; median filter over five samples, followed by 100 m centered grade windows. These are versioned tunable defaults. Mark coarse or sparse input; interpolating cannot recover missing hills. Don't compute across gaps.
5. `gradePct = 100 * deltaElevationM / horizontalDistanceM`. Compute ascent/descent from a reproducible deadband turning-point algorithm (provisional 3 m vertical hysteresis), recording method/version and thresholds. Test sensitivity to 25/50 m sampling and 3/5 m hysteresis before presenting precision.
6. A proposed “climb” definition is a contiguous uphill section of at least 200 m and 10 m rise, with an explicitly documented short-gap merge threshold. Store start/end distance, rise, length, mean grade, and maximum rolling-100-m grade. Label this a JMM analysis definition, never an official climb category.
7. Output elevation coverage fraction, gap count, raw/calculated/organizer distance differences, and method warnings. Do not replace unknown elevation with sea level. If insufficient data, null the metrics. A route length mismatch prompts review, rather than silently stretching route geometry.
8. Bridges/tunnels, barometric drift, DEM cell resolution, and smoothing can alter totals. Report rounded metrics and provenance; route-derived ascent is an estimate.

## Forecast, history, and climate must remain distinct

- `forecast`: specific upcoming valid times inside currently returned coverage, with update/fetch time and stale status.
- `historical_reanalysis`: modeled reconstruction of past weather. Open-Meteo archive uses reanalysis and supports multi-decade data; for long-term consistency its docs recommend ERA5/ERA5-Land rather than changing best-match models. Its archive accepts dates, coordinates and hourly variables. [Historical weather](https://open-meteo.com/en/docs/historical-weather-api)
- `historical_forecast`: archived forecast model output, not observed weather and not automatically a long-term climate baseline. Open-Meteo's stitched archive begins around 2021/2022 depending on model. [Historical forecast](https://open-meteo.com/en/docs/historical-forecast-api)
- `climatology`: a separately calculated distribution from a declared multi-year baseline, same seasonal/local-time window and consistent model. Proposed later baseline: 1991–2020 where available, with explicit coverage/missingness, median and empirical 10th/90th percentiles. These are historical ranges, not race-day forecast confidence intervals.
- `manual_scenario`: user-selected conditions, never labeled retrieved or climate-derived. Default placeholders must be visibly assumptions.

NASA POWER historical daily data is now implemented separately; it is not a 30-year normal. Do not manufacture climate automatically. A single previous year or a few recent years cannot justify a 30-year-normal label. Forecast plus baseline can appear side-by-side, never silently blended.

## Global UX, revision and privacy

Store meters, seconds, Celsius, m/s, degrees and percentages internally; convert display to km/mi, m/ft, °C/°F, km/h/mph and min/km/min/mi. Conversion must not create new scenario revisions. Persist IANA event timezone independently from viewer timezone. Retain local date/time and a resolved UTC instant; reject ambiguous/nonexistent DST starts until explicitly disambiguated. Do not infer IANA timezone from longitude or a fixed offset. Overnight races require the entire expected interval, potentially across dates.

Each field shows “Official”, “Imported”, “Calculated”, “Forecast”, “Typical seasonal range”, “Manual”, or “Unknown” as appropriate. Edits create an immutable scenario revision, preserve prior provider value, and mark affected calculations stale until recomputed. “Reset to retrieved value” is explicit. Never overwrite a manual override during weather refresh. Applying a new forecast produces a reviewable revision.

Send only public event coordinates (and optional venue elevation) to weather providers; race date/window filters may stay local for MET. No athlete identity, health/training fields, account IDs, race-performance predictions, or uploaded route required for weather requests. Public route elevation enrichment should likewise send only points needed, with user consent for any private route. Isolate public event/weather caches from private athlete data, redact provider query logs, set timeouts/size caps, and keep future keys server-side.

## Acceptance checks

- Same race name in two countries; two editions and two distances remain distinct.
- Missing date/course/elevation never converts to fabricated defaults.
- Forecast outside returned interval becomes unavailable, not nearest-current conditions.
- 6-hour precipitation never displays as an hourly value; optional variables and last-row missing intervals are safe.
- Local midnight/DST/overnight interval and southern-hemisphere seasons handled correctly.
- GPX with multiple segments, sparse elevation, antimeridian, duplicate points, malformed XML and extreme file size safely handled.
- Provider 403/429/outage degrades to manual scenario without fake data or hidden attribution.
- Manual override survives refresh; scenario revisions retain original evidence and analysis method.

## Implementation verification update

Implemented `race-course.ts` and `race-weather.ts` with focused tests in the implementation checkout. GPX v1 computes raw unsmoothed totals and explicitly labels this; no unvalidated smoothing was silently added. `courseToScenarioSegments` merges same-direction contiguous grades, preserving uphill/downhill runs and rejecting unsafe gaps/missing elevation/too many runs. Rendering profile is capped below 2,000 even with 100 disjoint track segments. MET adapter uses fixed upstream, bounded responses/timeouts, units validation, provider identification and cache headers. Historical adapter implements NASA POWER daily T2M/RH2M/WS10M, previous five complete seasonal windows, missing values and coverage. Exact source fields/credit are in `history-integration.md`. Deployment must provide a shared application-wide throttle in addition to per-process defensive limits.
