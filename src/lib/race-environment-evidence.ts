import type { RaceEnvironment, WeatherSnapshot } from './race-environment';
/** Reviewed source copy; never a server certification of provider provenance. */
export interface EnvironmentEvidence {
    original: RaceEnvironment;
    manual: WeatherSnapshot | null;
}
export function parseEnvironmentEvidence(raw: unknown): EnvironmentEvidence | null {
    if (raw === null || raw === undefined)
        return null;
    if (JSON.stringify(raw).length > 150000)
        throw Error('Weather evidence too large');
    const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v))
        throw Error('Invalid weather evidence'); return v as Record<string, unknown>; };
    const finite = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v);
    const text = (v: unknown, n = 2000) => typeof v === 'string' && v.length <= n;
    const iso = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
    const snapshot = (v: unknown) => {
        const s = obj(v);
        for (const k of ['airTempC', 'dewPointC', 'relativeHumidityPct', 'actualVaporPressureKPa', 'windSpeedMps', 'windDirectionDeg', 'solarRadiationWm2', 'cloudCoverPct', 'precipitationMm', 'surfacePressureHpa'])
            if (!finite(s[k]))
                throw Error('Invalid weather value');
        if (Object.keys(s).some(k => !['timestampUTC', 'timezone', 'latitude', 'longitude', 'airTempC', 'dewPointC', 'relativeHumidityPct', 'actualVaporPressureKPa', 'windSpeedMps', 'windDirectionDeg', 'solarRadiationWm2', 'cloudCoverPct', 'precipitationMm', 'surfacePressureHpa', 'wbgtC', 'wbgtMethod', 'source', 'dataType', 'retrievedAtUTC', 'modelName', 'sourceUpdatedAtUTC', 'dewPointMethod'].includes(k)) || s.sourceUpdatedAtUTC !== null && !iso(s.sourceUpdatedAtUTC))
            throw Error('Unexpected weather field or invalid source vintage');
        if (!iso(s.timestampUTC) || !iso(s.retrievedAtUTC) || !text(s.timezone, 100) || !text(s.modelName) || !text(s.source) || s.wbgtC !== null || s.wbgtMethod !== 'unavailable' || !['forecast', 'historical', 'climatology'].includes(String(s.dataType)) || !['derived', 'unavailable'].includes(String(s.dewPointMethod)) || typeof s.latitude !== 'number' || !Number.isFinite(s.latitude) || Math.abs(s.latitude) > 90 || typeof s.longitude !== 'number' || !Number.isFinite(s.longitude) || Math.abs(s.longitude) > 180)
            throw Error('Invalid weather provenance');
        return s as unknown as WeatherSnapshot;
    };
    const e = obj(raw), r = obj(e.original);
    if (Object.keys(e).some(k => !['original', 'manual'].includes(k)) || !['available', 'unavailable'].includes(String(r.status)) || !['live_forecast', 'historical_race_day', 'historical_seasonal_estimate', 'insufficient_weather_data'].includes(String(r.label)) || !iso(r.requestedAtUTC) || !Array.isArray(r.samples) || r.samples.length > 200 || !Array.isArray(r.baselineYears) || r.baselineYears.length > 5 || !r.baselineYears.every(y => Number.isInteger(y) && y >= 2001 && y <= 2100) || !Array.isArray(r.warnings) || r.warnings.length > 30 || !r.warnings.every(w => text(w)) || !text(r.sourceUrl) || !text(r.licenseUrl) || !text(r.attribution))
        throw Error('Invalid weather context');
    if (Object.keys(r).some(k => !['status', 'label', 'requestedAtUTC', 'snapshot', 'samples', 'ranges', 'baselineYears', 'sourceUrl', 'licenseUrl', 'attribution', 'warnings'].includes(k)))
        throw Error('Unexpected weather context field');
    for (const link of [r.sourceUrl, r.licenseUrl])
        if (link) {
            const u = new URL(String(link));
            if (u.protocol !== 'https:' || u.username || u.password)
                throw Error('Invalid weather source link');
        }
    const ranges = obj(r.ranges);
    if (Object.keys(ranges).length > 15)
        throw Error('Too many weather ranges');
    for (const v of Object.values(ranges)) {
        const range = obj(v);
        if (!['median', 'p10', 'p90', 'samples'].every(k => typeof range[k] === 'number' && Number.isFinite(range[k])))
            throw Error('Invalid weather range');
    }
    return { original: { ...r, snapshot: r.snapshot === null ? null : snapshot(r.snapshot), samples: r.samples.map(snapshot) } as unknown as RaceEnvironment, manual: e.manual === null ? null : snapshot(e.manual) };
}
