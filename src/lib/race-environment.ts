/** Environmental context only. This module never modifies athlete pace/power. */
import { getRaceScenarioWeather, validateRaceWeatherRequest, type RaceWeatherRequest, type RaceWeatherOptions } from './race-weather';
import { publicJson } from './race-event-lookup';
export interface WeatherSnapshot {
    timestampUTC: string;
    timezone: string;
    latitude: number;
    longitude: number;
    airTempC: number | null;
    dewPointC: number | null;
    relativeHumidityPct: number | null;
    actualVaporPressureKPa: number | null;
    windSpeedMps: number | null;
    windDirectionDeg: number | null;
    solarRadiationWm2: number | null;
    cloudCoverPct: number | null;
    precipitationMm: number | null;
    surfacePressureHpa: number | null;
    wbgtC: null;
    wbgtMethod: 'unavailable';
    source: string;
    dataType: 'forecast' | 'historical' | 'climatology';
    retrievedAtUTC: string;
    modelName: string;
    sourceUpdatedAtUTC: string | null;
    dewPointMethod: 'derived' | 'unavailable';
}
export interface RaceEnvironment {
    status: 'available' | 'unavailable';
    label: 'live_forecast' | 'historical_race_day' | 'historical_seasonal_estimate' | 'insufficient_weather_data';
    requestedAtUTC: string;
    snapshot: WeatherSnapshot | null;
    samples: WeatherSnapshot[];
    ranges: Record<string, {
        median: number;
        p10: number;
        p90: number;
        samples: number;
    }>;
    baselineYears: number[];
    sourceUrl: string;
    licenseUrl: string;
    attribution: string;
    warnings: string[];
}
import { dewPointFromRH, vaporPressureKPa } from "./race-thermal";
export { dewPointFromRH, vaporPressureKPa, overrideRaceEnvironment } from "./race-thermal";
const valid = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function base(request: RaceWeatherRequest, at: string, type: WeatherSnapshot['dataType'], retrieved: string): WeatherSnapshot { return { timestampUTC: at, timezone: request.timeZone, latitude: Math.trunc(request.latitude * 10000) / 10000, longitude: Math.trunc(request.longitude * 10000) / 10000, airTempC: null, dewPointC: null, relativeHumidityPct: null, actualVaporPressureKPa: null, windSpeedMps: null, windDirectionDeg: null, solarRadiationWm2: null, cloudCoverPct: null, precipitationMm: null, surfacePressureHpa: null, wbgtC: null, wbgtMethod: 'unavailable', source: 'NASA POWER', dataType: type, retrievedAtUTC: retrieved, modelName: 'unspecified', sourceUpdatedAtUTC: null, dewPointMethod: 'unavailable' }; }
const unavailable = (r: RaceWeatherRequest, reason: string): RaceEnvironment => ({ status: 'unavailable', label: 'insufficient_weather_data', requestedAtUTC: new Date(r.at).toISOString(), snapshot: null, samples: [], ranges: {}, baselineYears: [], sourceUrl: '', licenseUrl: '', attribution: '', warnings: [reason] });
/** UTC hours selected through the venue's civil timezone, not local solar time. */
export function parseHourlyEnvironment(raw: unknown, request: RaceWeatherRequest, type: 'historical' | 'climatology', retrievedAt: string): WeatherSnapshot[] {
    const root = obj(raw), header = obj(root.header), parameters = obj(root.parameters), values = obj(obj(root.properties).parameter);
    if (header.time_standard !== 'UTC' || typeof header.fill_value !== 'number' || !Array.isArray(header.sources) || !header.sources.every(s => typeof s === 'string'))
        throw Error('Historical source metadata missing');
    const specs: [
        keyof WeatherSnapshot,
        string,
        string,
        number,
        number,
        number
    ][] = [['airTempC', 'T2M', 'C', -90, 65, 1], ['relativeHumidityPct', 'RH2M', '%', 0, 100, 1], ['windSpeedMps', 'WS10M', 'm/s', 0, 100, 1], ['windDirectionDeg', 'WD10M', 'Degrees', 0, 360, 1], ['surfacePressureHpa', 'PS', 'kPa', 30, 110, 10], ['solarRadiationWm2', 'ALLSKY_SFC_SW_DWN', 'Wh/m^2', 0, 1500, 1], ['precipitationMm', 'PRECTOTCORR', 'mm/hour', 0, 1000, 1]];
    const keys = Object.keys(obj(values.T2M));
    if (keys.length > 24 * 20)
        throw Error('Hourly response exceeds the bounded seasonal window');
    return keys.sort().flatMap(key => {
        if (!/^\d{10}$/.test(key))
            return [];
        const at = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${key.slice(8, 10)}:00:00.000Z`;
        if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at)
            return [];
        const s = base(request, at, type, retrievedAt);
        s.modelName = (header.sources as string[]).join(' + ');
        for (const [field, param, unit, min, max, factor] of specs) {
            const v = obj(values[param])[key];
            if (obj(parameters[param]).units === unit && v !== header.fill_value && valid(v, min, max))
                (s as unknown as Record<string, unknown>)[field] = v * factor;
        }
        // POWER dew/frost-point changes phase below freezing; derive with the documented
        // liquid-water Magnus method consistently instead of mixing phase conventions.
        s.dewPointC = s.airTempC !== null && s.relativeHumidityPct !== null ? dewPointFromRH(s.airTempC, s.relativeHumidityPct) : null;
        s.actualVaporPressureKPa = s.dewPointC === null ? null : vaporPressureKPa(s.dewPointC);
        s.dewPointMethod = s.dewPointC === null ? 'unavailable' : 'derived';
        return [s];
    });
}
function localParts(at: string, zone: string) { return new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at)).replace(' ', 'T'); }
export function seasonalWindows(request: RaceWeatherRequest, now: number) {
    const local = localParts(request.at, request.timeZone), year = Math.min(Number(local.slice(0, 4)), new Date(now).getUTCFullYear()) - 1;
    const windows: {
        year: number;
        date: string;
        start: string;
        end: string;
        hour: string;
    }[] = [];
    for (let y = year; y > year - 5 && y >= 2001; y--) {
        const md = local.slice(5, 10) === '02-29' && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? '02-28' : local.slice(5, 10), date = `${y}-${md}`, center = Date.parse(date + 'T12:00:00Z');
        const day = (d: number) => new Date(center + d * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
        windows.push({ year: y, date, start: day(-8), end: day(8), hour: local.slice(11, 13) });
    }
    return windows;
}
export function summarizeSeasonalEnvironment(request: RaceWeatherRequest, samples: WeatherSnapshot[], years: number[]): RaceEnvironment {
    const target = localParts(request.at, request.timeZone), hour = target.slice(11, 13);
    const matched = new Set<number>(), seenDates = new Set<string>();
    const kept = samples.filter(s => {
        const local = localParts(s.timestampUTC, request.timeZone), date = local.slice(0, 10);
        if (local.slice(11, 13) !== hour || s.airTempC === null || s.relativeHumidityPct === null || s.windSpeedMps === null || seenDates.has(date))
            return false;
        const baseline = years.find(y => { const md = target.slice(5, 10) === '02-29' && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? '02-28' : target.slice(5, 10); return Math.abs(Date.parse(date) - Date.parse(`${y}-${md}`)) <= 7 * 86400000; });
        if (baseline === undefined)
            return false;
        matched.add(baseline);
        seenDates.add(date);
        return true;
    });
    const actualYears = [...matched].sort();
    if (actualYears.length < 3 || kept.length < 30)
        return unavailable(request, 'Insufficient matched race-hour history: at least three years and thirty joint samples are required.');
    // Retain joint observations; never assemble a fictional day from marginal medians/extremes.
    const ranges: RaceEnvironment['ranges'] = {};
    for (const k of ['airTempC', 'dewPointC', 'actualVaporPressureKPa', 'relativeHumidityPct', 'windSpeedMps', 'solarRadiationWm2']) {
        const a = kept.map(s => s[k as keyof WeatherSnapshot]).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
        if (a.length) {
            const q = (n: number) => { const i = (a.length - 1) * n, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
            ranges[k] = { median: q(.5), p10: q(.1), p90: q(.9), samples: a.length };
        }
    }
    return { status: 'available', label: 'historical_seasonal_estimate', requestedAtUTC: new Date(request.at).toISOString(), snapshot: null, samples: kept, ranges, baselineYears: actualYears, sourceUrl: 'https://power.larc.nasa.gov/', licenseUrl: 'https://science.data.nasa.gov/about/license', attribution: 'NASA POWER hourly grid estimates; JMM matched prior seasonal dates ±7 days and civil start hour. Not observations, a 30-year climate normal, or a future forecast.', warnings: ['Ranges are descriptive percentiles, not forecast or finishing-time confidence intervals. Joint samples are retained; marginal extremes must not be combined.', 'Coarse grid estimates may differ from venue conditions. Archive sources are recorded per sample; model/source changes can bias comparisons.'] };
}
const hourlyCache = new Map<string, {
    expires: number;
    samples: WeatherSnapshot[];
}>();
const pending = new Map<string, Promise<WeatherSnapshot[]>>();
let archiveRetryAt = 0;
async function hourly(request: RaceWeatherRequest, start: string, end: string, type: 'historical' | 'climatology', options: RaceWeatherOptions) {
    const now = options.now ?? Date.now, lat = Math.trunc(request.latitude * 10000) / 10000, lon = Math.trunc(request.longitude * 10000) / 10000, key = `${lat}:${lon}:${start}:${end}:${type}:${request.timeZone}`, cached = hourlyCache.get(key);
    if (cached && cached.expires > now())
        return cached.samples;
    const running = pending.get(key);
    if (running)
        return running;
    if (pending.size >= 5 || now() < archiveRetryAt)
        throw Error('Historical weather busy');
    const promise = (async () => {
        const url = new URL('https://power.larc.nasa.gov/api/temporal/hourly/point');
        for (const [k, v] of Object.entries({ parameters: 'T2M,RH2M,WS10M,WD10M,PS,ALLSKY_SFC_SW_DWN,PRECTOTCORR', community: 'RE', longitude: String(lon), latitude: String(lat), start, end, format: 'JSON', 'time-standard': 'UTC' }))
            url.searchParams.set(k, v);
        const response = await (options.fetcher ?? fetch)(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
        if (response.status === 429) {
            const retry = response.headers.get('retry-after') ?? '', seconds = Number(retry), at = Number.isFinite(seconds) && seconds > 0 ? now() + seconds * 1000 : Date.parse(retry);
            archiveRetryAt = Number.isFinite(at) ? Math.max(now() + 60000, at) : now() + 60000;
            throw Error('Archive throttled');
        }
        const raw = await publicJson(response, 1024 * 1024);
        const samples = parseHourlyEnvironment(raw, { ...request, latitude: lat, longitude: lon }, type, new Date(now()).toISOString());
        if (hourlyCache.size >= 100)
            hourlyCache.delete(hourlyCache.keys().next().value!);
        hourlyCache.set(key, { expires: now() + 86400000, samples });
        return samples;
    })();
    pending.set(key, promise);
    try {
        return await promise;
    }
    finally {
        pending.delete(key);
    }
}
/** MET forecast first; past races use historical UTC hours; distant races use joint seasonal hours. */
export async function getRaceEnvironment(input: RaceWeatherRequest, options: RaceWeatherOptions = {}): Promise<RaceEnvironment> {
    const request = validateRaceWeatherRequest(input), now = (options.now ?? Date.now)();
    if (process.env.RACE_ENVIRONMENT_ENABLED === 'false')
        return unavailable(request, 'Race environment lookup is disabled by the operator.');
    try {
        if (Date.parse(request.at) >= now) {
            const forecast = await getRaceScenarioWeather(request, options);
            if (forecast.point && forecast.status !== 'stale') {
                const p = forecast.point, s = base(request, p.at, 'forecast', forecast.fetchedAt!);
                s.airTempC = p.temperatureC;
                s.relativeHumidityPct = p.humidityPct;
                s.windSpeedMps = p.windMs;
                s.windDirectionDeg = p.windFromDeg;
                s.cloudCoverPct = p.cloudCoverPct ?? null;
                s.dewPointC = p.temperatureC !== null && p.humidityPct !== null ? dewPointFromRH(p.temperatureC, p.humidityPct) : null;
                s.actualVaporPressureKPa = s.dewPointC === null ? null : vaporPressureKPa(s.dewPointC);
                s.dewPointMethod = s.dewPointC === null ? 'unavailable' : 'derived';
                s.source = 'MET Norway';
                s.sourceUpdatedAtUTC = forecast.sourceUpdatedAt;
                s.modelName = 'Locationforecast 2.0; underlying model unspecified';
                return { status: 'available', label: 'live_forecast', requestedAtUTC: new Date(request.at).toISOString(), snapshot: s, samples: [], ranges: {}, baselineYears: [], sourceUrl: forecast.attribution[0].sourceUrl, licenseUrl: forecast.attribution[0].licenseUrl, attribution: forecast.attribution[0].text, warnings: [...forecast.warnings, 'WBGT unavailable: no validated natural wet-bulb/globe model is enabled. Radiation and surface pressure are not fabricated.'] };
            }
            if (forecast.status !== 'outside_horizon')
                return unavailable(request, 'Live forecast unavailable or stale; historical conditions have not been substituted as a forecast.');
            const windows = seasonalWindows(request, now), samples: WeatherSnapshot[] = [], deadline = (options.now ?? Date.now)() + 40000;
            // Sequential bounded archive windows; a failed year does not fabricate values.
            for (const w of windows) {
                if ((options.now ?? Date.now)() + 12000 > deadline)
                    break;
                try {
                    samples.push(...await hourly(request, w.start, w.end, 'climatology', options));
                }
                catch { /* coverage disclosed by years/sample counts */ }
            }
            return summarizeSeasonalEnvironment(request, samples, windows.map(w => w.year));
        }
        const target = Date.parse(request.at), day = (delta:number) => new Date(target + delta * 3600000).toISOString().slice(0, 10).replaceAll('-', ''), samples = await hourly(request, day(-1), day(1), 'historical', options);
        const point = samples.filter(s => s.airTempC !== null && Math.abs(Date.parse(s.timestampUTC) - target) <= 3600000).sort((a, b) => Math.abs(Date.parse(a.timestampUTC) - target) - Math.abs(Date.parse(b.timestampUTC) - target))[0];
        if (!point)
            return unavailable(request, 'Historical race-hour conditions unavailable; no current weather substituted.');
        return { status: 'available', label: 'historical_race_day', requestedAtUTC: new Date(request.at).toISOString(), snapshot: point, samples: [], ranges: {}, baselineYears: [], sourceUrl: 'https://power.larc.nasa.gov/', licenseUrl: 'https://science.data.nasa.gov/about/license', attribution: 'NASA POWER hourly grid estimates, not venue instrument measurements.', warnings: ['Nearest available UTC hour shown; civil timezone retained. Historical reanalysis can arrive after a delay.', 'WBGT unavailable; these conditions do not determine an individual finishing-time penalty.'] };
    }
    catch {
        return unavailable(request, 'Weather retrieval failed or was rate limited. No missing conditions have been assumed.');
    }
}
