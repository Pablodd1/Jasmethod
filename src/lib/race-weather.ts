/** Event-only weather adapter. Never pass athlete identity or health fields here. */
export interface RaceWeatherRequest {
  latitude: number; longitude: number; at: string; timeZone: string; altitudeM?: number;
}
export interface RaceWeatherPoint {
  at: string; temperatureC: number | null; humidityPct: number | null;
  windMs: number | null; windFromDeg: number | null;
  precipitation: { amountMm: number; intervalStart: string; intervalEnd: string } | null;
}
export interface RaceWeatherAttribution { text: string; sourceUrl: string; licenseUrl: string; modifications: string }
export interface RaceWeatherResult {
  kind: "forecast" | "unavailable";
  status: "fresh" | "stale" | "outside_horizon" | "provider_unavailable";
  requestedAt: string; timeZone: string; coverageStart: string | null; coverageEnd: string | null;
  fetchedAt: string | null; sourceUpdatedAt: string | null;
  point: RaceWeatherPoint | null; points: RaceWeatherPoint[];
  attribution: RaceWeatherAttribution[]; warnings: string[];
}
export const RACE_WEATHER_ATTRIBUTION: RaceWeatherAttribution = {
  text: "Based on data from MET Norway", sourceUrl: "https://api.met.no/",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  modifications: "Selected nearest available forecast instant within forecast coverage; values are not venue observations.",
};
type Obj = Record<string, unknown>;
const object = (x: unknown): Obj => x !== null && typeof x === "object" && !Array.isArray(x) ? x as Obj : {};
const numeric = (x: unknown, min: number, max: number) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : null;
function iso(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)!;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(x => Number(x ?? 0));
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return new Date(value).toISOString();
}
export function validateRaceWeatherRequest(value: unknown): RaceWeatherRequest {
  const v = object(value);
  if (Object.keys(v).some(k => !["latitude", "longitude", "at", "timeZone", "altitudeM"].includes(k))) throw new Error("Weather accepts event coordinates and time only.");
  if (numeric(v.latitude, -90, 90) === null || numeric(v.longitude, -180, 180) === null) throw new Error("Valid event latitude and longitude are required.");
  if (!iso(v.at)) throw new Error("Event time must be an ISO timestamp with a UTC offset.");
  if (typeof v.timeZone !== "string" || v.timeZone.length > 100) throw new Error("An event IANA timezone is required.");
  try { new Intl.DateTimeFormat("en", { timeZone: v.timeZone }).format(new Date(v.at as string)); }
  catch { throw new Error("Event timezone is invalid."); }
  // Z is a canonical instant. A supplied local offset must match the selected venue zone.
  if (!(v.at as string).endsWith("Z")) {
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: v.timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(v.at as string)).replace(" ", "T");
    if (local.slice(0, 16) !== (v.at as string).slice(0, 16)) throw new Error("Event time offset does not match its IANA timezone.");
  }
  if (v.altitudeM !== undefined && (numeric(v.altitudeM, -500, 9000) === null || !Number.isInteger(v.altitudeM))) throw new Error("Venue altitude must be whole meters between -500 and 9000.");
  return { latitude: v.latitude as number, longitude: v.longitude as number, at: v.at as string, timeZone: v.timeZone, ...(v.altitudeM === undefined ? {} : { altitudeM: v.altitudeM as number }) };
}
function unavailable(request: RaceWeatherRequest, status: RaceWeatherResult["status"], warning: string): RaceWeatherResult {
  return { kind: "unavailable", status, requestedAt: request.at, timeZone: request.timeZone,
    coverageStart: null, coverageEnd: null, fetchedAt: null, sourceUpdatedAt: null,
    point: null, points: [], attribution: [], warnings: [warning] };
}
/** Pure schema/unit validation and time selection, suitable for deterministic fixtures. */
export function parseRaceWeatherForecast(raw: unknown, input: RaceWeatherRequest, fetchedAt: string): RaceWeatherResult {
  const request = validateRaceWeatherRequest(input);
  const properties = object(object(raw).properties), meta = object(properties.meta), units = object(meta.units);
  if (!Array.isArray(properties.timeseries) || properties.timeseries.length > 1000) throw new Error("Invalid forecast timeseries.");
  const fields = ["air_temperature", "relative_humidity", "wind_speed", "wind_from_direction", "precipitation_amount"];
  const expected = ["celsius", "%", "m/s", "degrees", "mm"];
  const unitOk = (name: string) => units[name] === expected[fields.indexOf(name)];
  const points: RaceWeatherPoint[] = [];
  for (const row of properties.timeseries) {
    const r = object(row), at = iso(r.time);
    if (!at) throw new Error("Invalid forecast timestamp.");
    const data = object(r.data), instant = object(object(data.instant).details);
    let precipitation: RaceWeatherPoint["precipitation"] = null;
    for (const hours of [1, 6, 12]) {
      const amount = numeric(object(object(data[`next_${hours}_hours`]).details).precipitation_amount, 0, 5000);
      if (amount !== null && unitOk("precipitation_amount")) {
        precipitation = { amountMm: amount, intervalStart: at, intervalEnd: new Date(Date.parse(at) + hours * 3600000).toISOString() }; break;
      }
    }
    points.push({ at, temperatureC: unitOk("air_temperature") ? numeric(instant.air_temperature, -100, 70) : null,
      humidityPct: unitOk("relative_humidity") ? numeric(instant.relative_humidity, 0, 100) : null,
      windMs: unitOk("wind_speed") ? numeric(instant.wind_speed, 0, 150) : null,
      windFromDeg: unitOk("wind_from_direction") ? numeric(instant.wind_from_direction, 0, 360) : null, precipitation });
  }
  if (!points.length || points.some((p, i) => i > 0 && p.at <= points[i - 1].at)) throw new Error("Forecast timestamps must increase.");
  const result: RaceWeatherResult = { kind: "forecast", status: "fresh", requestedAt: request.at, timeZone: request.timeZone,
    coverageStart: points[0].at, coverageEnd: points[points.length - 1].at, fetchedAt,
    sourceUpdatedAt: iso(meta.updated_at), point: null, points, attribution: [{ ...RACE_WEATHER_ATTRIBUTION }],
    warnings: ["Forecast grid conditions can differ from the race venue, especially in complex terrain."] };
  if (fields.some(f => !unitOk(f))) result.warnings.push("Some forecast units are missing or unsupported; affected values are unavailable.");
  const target = Date.parse(request.at);
  if (target < Date.parse(points[0].at) || target > Date.parse(points[points.length - 1].at)) {
    result.kind = "unavailable"; result.status = "outside_horizon"; result.points = [];
    result.warnings.push("Event time is outside available forecast coverage. Set manual conditions or use a separately labeled historical summary.");
    return result;
  }
  result.point = points.reduce((best, p) => Math.abs(Date.parse(p.at) - target) < Math.abs(Date.parse(best.at) - target) ? p : best);
  if (Date.parse(result.point.at) !== target) result.warnings.push("Nearest forecast sample selected; its actual timestamp is shown separately from race start.");
  return result;
}
interface CacheEntry { raw: unknown; fetchedAt: string; expiresAt: number; lastModified: string | null }
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<CacheEntry>>();
let nextFetchAt = 0;
export function clearRaceWeatherCacheForTests(): void { cache.clear(); pending.clear(); nextFetchAt = 0; }
export interface RaceWeatherOptions { userAgent?: string; fetcher?: typeof fetch; now?: () => number }
async function boundedJson(response: Response): Promise<unknown> {
  const cap = 1024 * 1024;
  if (Number(response.headers.get("content-length")) > cap) throw new Error("Forecast response too large.");
  if (!response.body) throw new Error("Empty forecast response.");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength;
      if (total > cap) throw new Error("Forecast response too large."); chunks.push(value); }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
/** Server-side only. Configuration needs a real application/contact identifier, not a key. */
export async function getRaceScenarioWeather(input: RaceWeatherRequest, options: RaceWeatherOptions = {}): Promise<RaceWeatherResult> {
  const request = validateRaceWeatherRequest(input), now = options.now ?? Date.now;
  const userAgent = options.userAgent ?? process.env.RACE_WEATHER_USER_AGENT;
  if (!userAgent || userAgent.length > 300 || /[\r\n]/.test(userAgent) || !/(?:https:\/\/|[^\s]+@[^\s]+)/.test(userAgent)) return unavailable(request, "provider_unavailable", "Live weather needs a configured application contact. Manual conditions remain available.");
  const lat = Math.trunc(request.latitude * 10000) / 10000, lon = Math.trunc(request.longitude * 10000) / 10000;
  const key = `${lat}:${lon}:${request.altitudeM ?? "auto"}`;
  let entry = cache.get(key);
  try {
    if (!entry || entry.expiresAt <= now()) {
      let promise = pending.get(key);
      if (!promise) {
        // Per-process conservative budget; deployment must additionally enforce a shared application-wide limit.
        if (now() < nextFetchAt) return unavailable(request, "provider_unavailable", "Weather lookup is temporarily rate-limited. Try again shortly.");
        nextFetchAt = now() + 1000;
        const previous = entry;
        promise = (async () => {
          const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
          url.searchParams.set("lat", String(lat)); url.searchParams.set("lon", String(lon));
          if (request.altitudeM !== undefined) url.searchParams.set("altitude", String(request.altitudeM));
          const headers: Record<string, string> = { "User-Agent": userAgent, Accept: "application/json" };
          if (previous?.lastModified) headers["If-Modified-Since"] = previous.lastModified;
          const response = await (options.fetcher ?? fetch)(url.toString(), { headers, signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store" });
          if (response.status === 429) { nextFetchAt = now() + 60000; throw new Error("Throttled"); }
          if (response.status !== 200 && response.status !== 304) throw new Error("Forecast unavailable");
          const raw = response.status === 304 && previous ? previous.raw : await boundedJson(response);
          const fetchedAt = new Date(now()).toISOString();
          // Validate before caching; no unknown body is persisted as successful forecast.
          parseRaceWeatherForecast(raw, request, fetchedAt);
          const expiry = Date.parse(response.headers.get("expires") ?? "");
          const saved: CacheEntry = { raw, fetchedAt, expiresAt: Number.isFinite(expiry) && expiry > now() ? expiry : now() + 3600000,
            lastModified: response.headers.get("last-modified") ?? previous?.lastModified ?? null };
          if (cache.size >= 100 && !cache.has(key)) cache.delete(cache.keys().next().value as string);
          cache.set(key, saved); return saved;
        })();
        pending.set(key, promise);
      }
      try { entry = await promise; } finally { pending.delete(key); }
    }
    return parseRaceWeatherForecast(entry.raw, request, entry.fetchedAt);
  } catch {
    if (entry && now() - Date.parse(entry.fetchedAt) < 6 * 3600000) {
      const result = parseRaceWeatherForecast(entry.raw, request, entry.fetchedAt);
      if (result.kind === "forecast") { result.status = "stale"; result.warnings.push("Weather refresh failed. This is a previously retrieved forecast; check its update time."); }
      return result;
    }
    return unavailable(request, "provider_unavailable", "Weather could not be retrieved. Manual conditions remain available.");
  }
}

export interface RaceHistoryRequest { latitude: number; longitude: number; eventDate: string }
export interface RaceHistoricalMetric { median: number; p10: number; p90: number; samples: number }
export interface RaceHistoryResult {
  kind: "historical_summary" | "unavailable"; status: "available" | "provider_unavailable";
  eventDate: string; baselineYears: number[]; yearsWithData: number[];
  windowDaysEitherSide: number; expectedSamples: number; completeSamples: number;
  temperatureC: RaceHistoricalMetric | null; humidityPct: RaceHistoricalMetric | null; windMs: RaceHistoricalMetric | null;
  timeStandard: "local_solar_daily"; fetchedAt: string | null;
  attribution: RaceWeatherAttribution[]; warnings: string[];
}
export const RACE_HISTORY_ATTRIBUTION: RaceWeatherAttribution = {
  text: "Historical meteorology from NASA POWER", sourceUrl: "https://power.larc.nasa.gov/",
  licenseUrl: "https://science.data.nasa.gov/about/license",
  modifications: "JMM summarizes daily grid estimates for the same seasonal window across up to five previous complete years. This is not a race-day forecast or a 30-year climate normal.",
};
const historyCache = new Map<string, { expiresAt: number; result: RaceHistoryResult }>();
const historyPending = new Map<string, Promise<RaceHistoryResult>>();
let nextHistoryAt = 0;
export function validateRaceHistoryRequest(value: unknown): RaceHistoryRequest {
  const v = object(value);
  if (Object.keys(v).some(k => !["latitude", "longitude", "eventDate"].includes(k))) throw new Error("Historical weather accepts event coordinates and date only.");
  if (numeric(v.latitude, -90, 90) === null || numeric(v.longitude, -180, 180) === null) throw new Error("Valid event latitude and longitude are required.");
  if (typeof v.eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate) || !iso(`${v.eventDate}T00:00:00Z`)) throw new Error("A valid event calendar date is required.");
  if (Number(v.eventDate.slice(0, 4)) < 1982 || Number(v.eventDate.slice(0, 4)) > 2100) throw new Error("Historical comparisons support event years 1982–2100.");
  return { latitude: v.latitude as number, longitude: v.longitude as number, eventDate: v.eventDate };
}
function historyPlan(request: RaceHistoryRequest, now: number) {
  const currentYear = new Date(now).getUTCFullYear();
  const latest = Math.min(currentYear, Number(request.eventDate.slice(0, 4))) - 1;
  const cutoff = Date.UTC(Math.min(currentYear, Number(request.eventDate.slice(0, 4))), 0, 1);
  const years: number[] = [], dates: string[] = [];
  const month = Number(request.eventDate.slice(5,7)) - 1, day = Number(request.eventDate.slice(8,10));
  for (let year = latest; year >= 1981 && years.length < 5; year--) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const center = Date.UTC(year, month, month === 1 && day === 29 && !leap ? 28 : day);
    const start = center - 7 * 86400000, end = center + 7 * 86400000;
    if (start < Date.UTC(1981,0,1) || end >= cutoff) continue;
    years.push(year);
    for (let t = start; t <= end; t += 86400000) dates.push(new Date(t).toISOString().slice(0,10).replaceAll("-", ""));
  }
  years.sort(); dates.sort();
  if (!dates.length) throw new Error("No complete prior seasonal window is available in the historical archive.");
  return { years, dates, start: dates[0], end: dates[dates.length-1] };
}
function summary(values: number[]): RaceHistoricalMetric | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  const quantile = (q: number) => { const index=(sorted.length-1)*q, lower=Math.floor(index); return sorted[lower]+(sorted[Math.ceil(index)]-sorted[lower])*(index-lower); };
  return { median: quantile(0.5), p10: quantile(0.1), p90: quantile(0.9), samples: sorted.length };
}
/** Summarizes actual returned daily estimates, never fabricates missing days or observations. */
export function parseRaceHistoricalWeather(raw: unknown, input: RaceHistoryRequest, fetchedAt: string, now = Date.now()): RaceHistoryResult {
  const request=validateRaceHistoryRequest(input), plan=historyPlan(request,now);
  const root=object(raw), header=object(root.header), metadata=object(root.parameters), params=object(object(root.properties).parameter);
  if (header.time_standard !== "LST" || typeof header.fill_value !== "number") throw new Error("Historical weather metadata is missing.");
  const fieldSpecs: [string,string,number,number][] = [["T2M","C",-100,70],["RH2M","%",0,100],["WS10M","m/s",0,150]];
  const values: number[][]=[[],[],[]]; let completeSamples=0; const actualYears=new Set<number>();
  for (const date of plan.dates) {
    let complete=true;
    for(let i=0;i<fieldSpecs.length;i++) {
      const [field,unit,min,max]=fieldSpecs[i]; const candidate=object(params[field])[date];
      const value=object(metadata[field]).units === unit && candidate !== header.fill_value ? numeric(candidate,min,max) : null;
      if(value===null) complete=false; else { values[i].push(value); actualYears.add(Number(date.slice(0,4))); }
    }
    if(complete) completeSamples++;
  }
  const any=values.some(v=>v.length);
  return { kind:any?"historical_summary":"unavailable",status:any?"available":"provider_unavailable", eventDate:request.eventDate,
    baselineYears:plan.years,yearsWithData:[...actualYears].sort(),windowDaysEitherSide:7,expectedSamples:plan.dates.length,completeSamples,
    temperatureC:summary(values[0]),humidityPct:summary(values[1]),windMs:summary(values[2]),timeStandard:"local_solar_daily",fetchedAt,
    attribution:[{...RACE_HISTORY_ATTRIBUTION}],warnings:["Daily estimates on a coarse meteorological grid; they do not describe exact venue or race-start conditions.",
      "Daily periods use local solar time, not the event's civil timezone. Historical percentiles are descriptive ranges, not forecast confidence intervals.",
      ...(request.eventDate.endsWith("02-29")?["February 29 is centered on February 28 in non-leap reference years."]:[]),
      ...(completeSamples<plan.dates.length?["Some historical days or variables are missing; sample coverage is shown."]:[])] };
}
export async function getRaceScenarioHistory(input: RaceHistoryRequest, options: RaceWeatherOptions = {}): Promise<RaceHistoryResult> {
  const request=validateRaceHistoryRequest(input),now=options.now??Date.now,plan=historyPlan(request,now());
  const lat=Math.trunc(request.latitude*10000)/10000,lon=Math.trunc(request.longitude*10000)/10000;
  const key=`${lat}:${lon}:${request.eventDate}:${plan.start}:${plan.end}`;
  const cached=historyCache.get(key); if(cached && cached.expiresAt>now()) return cached.result;
  const existing=historyPending.get(key); if(existing) return existing;
  const failure=():RaceHistoryResult=>({kind:"unavailable",status:"provider_unavailable",eventDate:request.eventDate,baselineYears:plan.years,yearsWithData:[],
    windowDaysEitherSide:7,expectedSamples:plan.dates.length,completeSamples:0,temperatureC:null,humidityPct:null,windMs:null,timeStandard:"local_solar_daily",fetchedAt:null,
    attribution:[],warnings:["Historical weather could not be retrieved. No seasonal values have been assumed."]});
  if(now()<nextHistoryAt || historyPending.size>=5) return failure(); nextHistoryAt=now()+1000;
  const promise=(async()=>{
    try {
      const url=new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
      for(const [key,value] of Object.entries({parameters:"T2M,RH2M,WS10M",community:"AG",longitude:String(lon),latitude:String(lat),start:plan.start,end:plan.end,format:"JSON","time-standard":"LST"})) url.searchParams.set(key,value);
      const response=await(options.fetcher??fetch)(url.toString(),{signal:AbortSignal.timeout(15000),redirect:"error",cache:"no-store",headers:{Accept:"application/json"}});
      if(response.status===429) nextHistoryAt=now()+60000;
      if(!response.ok) return failure();
      const raw=await boundedJson(response),result=parseRaceHistoricalWeather(raw,request,new Date(now()).toISOString(),now());
      if(result.kind==="historical_summary") { if(historyCache.size>=100) historyCache.delete(historyCache.keys().next().value as string); historyCache.set(key,{expiresAt:now()+86400000,result}); }
      return result;
    } catch { return failure(); }
  })();
  historyPending.set(key,promise); try{return await promise;}finally{historyPending.delete(key);}
}
