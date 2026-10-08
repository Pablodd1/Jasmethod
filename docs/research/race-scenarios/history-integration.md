# NASA POWER same-period historical weather integration

Verified 2026-10-08 using official NASA documentation and unauthenticated live API requests. This is a separate historical baseline, not the MET Norway forecast and not an exact race-hour weather estimate.

## Decision

Use the NASA POWER Daily Point API, with server-side fetching. The API is global and no account, token, or API key was needed in two successful live tests. POWER data are public-domain, free, and explicitly usable in commercial applications according to the [official NASA Earthdata forum announcement](https://forum.earthdata.nasa.gov/viewtopic.php?t=82). Acknowledgment is requested. The NASA Science Data Portal also gives [general license guidance](https://science.data.nasa.gov/about/license), but the POWER-specific statement is the more direct evidence for this selection.

Include visible credit with a link to https://power.larc.nasa.gov/ . Recommended full source credit, as recorded by the [NASA dataset catalog](https://data.nasa.gov/dataset/prediction-of-worldwide-energy-resources-power): “This data was obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program.” Also say JMM aggregated the daily data. Do not imply NASA endorses JMM. Distinguish requested attribution from a legally mandatory attribution license; NASA's POWER statement describes an acknowledgment request, not a commercial-use prohibition.

## Exact upstream contract

GET https://power.larc.nasa.gov/api/temporal/daily/point

Query:
- parameters=T2M,T2M_MIN,T2M_MAX,RH2M,WS2M
- community=AG
- longitude={finite degrees in [-180,180]}
- latitude={finite degrees in [-90,90]}
- start=YYYYMMDD
- end=YYYYMMDD
- format=JSON
- time-standard=LST

[Daily API documentation](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) supports JSON, date ranges, and up to 20 parameters for one point. Daily UTC and local solar time data begin 1981-01-01. LST is the default; send it explicitly. LST is a solar-time swath, not an IANA civil time zone and not daylight-saving-aware. Start and end are inclusive in the live test. No use of the monthly/climatology endpoint is necessary: app-side filtering of actual daily records preserves exact selected years and dates.

Live-verified shape (values below are actual London results for 2024-04-15):

```json
{
  "type": "Feature",
  "geometry": {"type": "Point", "coordinates": [-0.128, 51.507, 73.15]},
  "properties": {"parameter": {
    "T2M": {"20240415": 7.87},
    "T2M_MIN": {"20240415": 5.36},
    "T2M_MAX": {"20240415": 10.75},
    "RH2M": {"20240415": 78.48},
    "WS2M": {"20240415": 6.72}
  }},
  "header": {
    "api": {"version": "v2.10.0", "name": "POWER Daily API"},
    "sources": ["MERRA2", "POWER"],
    "fill_value": -999.0,
    "time_standard": "LST",
    "start": "20240415",
    "end": "20240417"
  },
  "messages": [],
  "parameters": {
    "T2M": {"units": "C", "longname": "Temperature at 2 Meters"},
    "RH2M": {"units": "%", "longname": "Relative Humidity at 2 Meters"},
    "WS2M": {"units": "m/s", "longname": "Wind Speed at 2 Meters"}
  }
}
```

The requested production summary uses WS2M and must label the wind height as 2 m. A second multiyear live request separately confirmed WS10M.units='m/s' and longname='Wind Speed at 10 Meters'. MET forecast wind is commonly at 10 m: do not silently compare or substitute these wind heights. Request WS10M as well if a directly height-matched display is desired. Never interpret daily mean speed as a route headwind.

Parse properties.parameter[parameter][YYYYMMDD]. Units are C for all three temperatures, % for RH2M, m/s for WS10M/WS2M. Verify units against response metadata. Exclude values equal to header.fill_value, null, nonfinite, absent, or invalid for that variable. Reject RH outside 0–100 and negative wind; never convert missing values to zero. Retain fill counts by variable. Preserve header source/version/time standard and fetchedAt.

## Sampling and summary design (JMM proposal)

For the initial five-year summary, use the most recent five completed calendar years prior to both the current year and event year. Example: for a 2027 race queried in October 2026, use 2021–2025. Use the event's month/day with a ±7-calendar-day window in each reference year. A 2024 target instead uses 2019–2023 to avoid retrospectively incorporating post-event climate.

Construct each target date separately rather than matching numeric day-of-year, so leap years do not shift March–December. Map February 29 to February 28 in non-leap years and disclose that rule. Window construction must preserve December/January crossings. Select years only when each window is within the available archive and already complete; no future or current partial days. Clip before 1981 only by reporting reduced coverage, never silently inventing prior years.

Fetch a single contiguous envelope from the earliest selected window's start through the latest selected window's end, then keep only dates belonging to the selected windows. This costs one request and avoids five concurrent seasonal calls. Live verification of 2016-04-15 through 2025-04-29 with five parameters returned HTTP 200 in 5.39 seconds, 272,322 bytes, 3,302 dates per variable. Those latency/size figures are observations, not a service guarantee. Sample evidence is in `nasa-power-verified-sample.json`.

For each variable, show median, mean, minimum and maximum of the retained daily records; optionally also P10–P90. The minimum and maximum of daily means describe the historical range of daily means, not the within-day temperature low/high. Label any quantile band as historical daily variability, never a forecast confidence interval. Keep daily mean temperature separate from mean daily minimum/maximum. Report requested reference years, actually covered years, valid day count per variable, expected day count, window width, retrieval time, and source. If a variable is missing, leave it unavailable; do not claim all variables have identical coverage. A reasonable application policy is to warn below 90% day completeness and refuse a 'typical conditions' aggregate below five substantially covered years. These thresholds are app policy, not NASA guarantees.

Suggested primary label: “Past same-period weather”. Secondary example: “15-day seasonal windows, 2021–2025; daily regional reanalysis. Not a race-day forecast.” Historical data should remain visible even when forecast is unavailable. Copying a historical summary into manual scenario assumptions must be explicit and preserve its historical provenance; refreshing forecast must not overwrite chosen assumptions.

## Resolution, uncertainty, and availability

The [NASA meteorological methodology](https://power.larc.nasa.gov/docs/methodology/meteorology/) identifies MERRA-2 reanalysis at 0.5° latitude × 0.625° longitude. These are grid-cell regional estimates informed by observations and a model, not point weather-station observations. Elevation represents a grid average; hills, coastal effects, local shelter, and course-scale microclimates can differ. Daily minimum/maximum are extrema among the modeled hourly temperatures; other requested variables are daily averages.

Do not describe the coarse cell as precise venue weather, and do not use LST daily data to infer a 9 a.m. temperature. Do not lapse-correct against GPX elevations without a separately justified model. Prefer whole-degree or one-decimal display precision over pretending the provider's hundredths imply site-level accuracy.

[NASA data FAQ](https://power.larc.nasa.gov/docs/faqs/data/) reports typical meteorological latency of 2–3 days, but live archive freshness may differ. The [official request tutorial](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/) says improved climate-quality data replace near-real-time meteorology after roughly 2–3 months. Prior completed years avoid most provisional-data concerns; still retain retrieval/version metadata.

## Operational limits and failure handling

- [NASA's rate-limit answer](https://forum.earthdata.nasa.gov/viewtopic.php?t=4273) publishes no fixed request quota and warns that equitable-use throttling occurs. Do not apply api.nasa.gov API-key quotas to this different service.
- The [official request tutorial](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/) recommends no more than five concurrent requests and avoiding repeated requests finer than the actual grid. For JMM, use one concurrent history request per scenario, deduplicate inflight requests, and cache completed-year responses for weeks rather than refetching on every render. Respect provider response caching/rate headers when supplied; use bounded retries with jitter for 429/5xx and timeouts, not rapid loops.
- No separate maximum daily date-span was established in the current docs. The roughly nine-year live envelope succeeded. App-bound the configured window to five reference years for the initial implementation and response size, e.g. 2 MiB and 30 seconds, rather than promising arbitrary multi-decade fetches.
- Live response did not include Access-Control-Allow-Origin; use the existing server adapter rather than relying on browser CORS.
- Use a fixed allowlisted upstream hostname/path. Transmit only public event coordinates, parameters, and date bounds, never athlete data or a full scenario object. Validate incoming coordinate/date values and strip unsupported keys.
- On unavailable/malformed/rate-limited results, return historical status 'unavailable' with safe retry guidance. Do not substitute canned values, contemporary forecast data, or an undocumented alternative provider. Preserve previously saved historical summaries with an explicit fetched-at/stale label.
