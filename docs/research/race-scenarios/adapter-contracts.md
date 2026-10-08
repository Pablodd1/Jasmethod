# Proposed adapter contracts (v1)

This is specification pseudocode; implementation may adapt naming. Internal units fixed to SI. Research/provenance/licensing rationale in `data-integrations.md`.

```ts
type Attribution = {
  text: string; sourceUrl: string; licenseUrl: string;
  modifications: string;
};
type Provenance = {
  origin: 'official' | 'imported' | 'calculated' | 'manual' | 'provider';
  sourceUrl?: string; fetchedAt?: string; sourceUpdatedAt?: string;
  editionDate?: string; confirmedByUser: boolean;
};
type Coordinates = { latitude: number; longitude: number };
type WeatherRequest = Coordinates & {
  at: string; // ISO timestamp WITH UTC offset, never a bare local time
  endAt?: string; // optional interval endpoint
  timeZone: string; // validated IANA, required to explain event-local date
  altitudeM?: number; // finite integer ground elevation, optional
};
type WeatherPoint = {
  at: string; temperatureC: number | null; humidityPct: number | null;
  windMs: number | null; windFromDeg: number | null;
  precipitation: null | { amountMm: number; intervalStart: string; intervalEnd: string };
};
type WeatherResult = {
  kind: 'forecast' | 'manual_scenario' | 'unavailable';
  status: 'fresh' | 'stale' | 'outside_horizon' | 'provider_unavailable' | 'invalid_input';
  requestedAt: string; timeZone: string;
  coverageStart: string | null; coverageEnd: string | null;
  fetchedAt: string | null; sourceUpdatedAt: string | null;
  point: WeatherPoint | null; // null outside horizon, never nearest current weather
  points: WeatherPoint[];
  attribution: Attribution[];
  warnings: string[];
};
type CoursePoint = {
  distanceM: number; latitude: number; longitude: number;
  elevationM: number | null; segmentIndex: number;
};
type CourseSegment = {
  startDistanceM: number; endDistanceM: number;
  distanceM: number; elevationChangeM: number | null;
  gradePct: number | null; // signed, 100 * elevationChange / horizontal distance
  trackSegmentIndex: number;
};
type CourseResult = {
  format: 'gpx'; distanceM: number;
  ascentM: number | null; descentM: number | null;
  minElevationM: number | null; maxElevationM: number | null;
  elevationCoverage: number; // [0,1], specify length-weighted when possible
  profile: CoursePoint[];
  segments: CourseSegment[];
  sourcePointCount: number; trackSegmentCount: number; gapCount: number;
  method: { version: string; resampleM: number | null; smoothing: string; ascentMethod: string };
  officialStatus: 'unverified'; // parsing never verifies official race provenance
  warnings: string[];
};
```

## Required weather boundary behavior

- Runtime reject unexpected athlete/health fields, nonfinite lat/lon, abs(latitude)>90, abs(longitude)>180, invalid time/zone and implausible altitude. Use allowlisted fixed upstream URL; no user-controlled host/path.
- Limit response size and request duration; all upstream failures return non-sensitive typed errors. Do not echo request headers or tokens.
- GET MET compact with `lat`, `lon`, optionally `altitude`; do not transmit user id or entire WeatherRequest. Event `at`, timezone and interval stay local.
- Truncate coordinate decimal precision to at most four places. Cache key includes provider/version/lat/lon/altitude; not athlete or performance data.
- MET source paths are in data-integrations.md. Preserve missing numeric values as null, and validate units.
- For interpolation, allow only enclosing forecast instants within coverage; label interpolation and temporal resolution. For MVP nearest forecast sample is acceptable only inside coverage and with actual sample timestamp exposed; never claim it is exact race-time forecast.
- Required visible attribution: text `Based on data from MET Norway`; source `https://api.met.no/`; license `https://creativecommons.org/licenses/by/4.0/`; modifications explain aggregation/interpolation if performed.
- Obey cache Expires and If-Modified-Since; no active race-day polling or scheduled work implied by this adapter.

## Required course boundary behavior

- Proposed input limit 5 MiB UTF-8 and 100,000 source points; output profile cap e.g. 2,000 points for rendering. Compute metrics before visualization decimation. Reject limits with actionable error.
- No remote import URLs. Disable/reject `DOCTYPE` and `ENTITY`; parse XML safely; allow GPX 1.0/1.1 only when implemented deliberately. Guard numeric strings rather than accepting empty attributes as zero.
- Route and track selection is explicit if both exist. Preserve disconnected `trkseg` boundaries; do not add distance/elevation between them. GPX timestamps/extensions are not needed for a public course.
- Missing elevation on any relevant stretch produces null grade there and warning. Whole-route ascent/descent must be null unless fully supported; partial totals may be separately labeled, never passed as complete totals.
- Duplicate points/zero horizontal distance cannot create infinite grade. Use antimeridian-safe geodesic distance. Grade/downhill signs are preserved.
- Basic raw GPX ascent may be implemented initially if labeled raw/unsmoothed; do not call it DEM-corrected or filtered. Distance-window smoothing and hysteresis methods require explicit version and tests.

## Scenario store envelope

```ts
type ScenarioRevision = {
  id: string; revision: number; previousRevisionId: string | null;
  createdAt: string; modelVersion: string;
  event: {
    name: string; editionDate: string; localStartTime: string;
    timeZone: string; resolvedStartAt: string;
    countryCode: string | null; venue: string;
    officialUrl: string | null; distanceVariant: string;
    provenance: Provenance;
  };
  fieldProvenance: Record<string, Provenance>;
  overrides: Record<string, { value: unknown; originalValue: unknown; changedAt: string }>;
  // CourseResult, WeatherResult and athlete inputs remain distinct subobjects.
};
```

Manual changes require a new revision; weather refresh must not overwrite overrides. A unit display change is not a substantive revision. Model outputs record exact input revision and become stale after inputs change.
