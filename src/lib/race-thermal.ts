import type { WeatherSnapshot } from "./race-environment";
const valid = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
/** Magnus approximation over liquid water, -40..50 °C. Not wet bulb, WBGT or VPD. */
export function vaporPressureKPa(dewPointC: number): number | null {
    return valid(dewPointC, -40, 50) ? 0.61094 * Math.exp(17.625 * dewPointC / (dewPointC + 243.04)) : null;
}
export function dewPointFromRH(tempC: number, rh: number): number | null {
    if (!valid(tempC, -40, 50) || !valid(rh, 0, 100) || rh === 0)
        return null;
    const gamma = Math.log(rh / 100) + 17.625 * tempC / (243.04 + tempC), td = 243.04 * gamma / (17.625 - gamma);
    return valid(td, -40, 50) ? td : null;
}
/** Resolve overrides independently; retain the original snapshot for audit/reload. */
export function overrideRaceEnvironment(original: WeatherSnapshot, changes: {
    airTempC?: number;
    dewPointC?: number;
    relativeHumidityPct?: number;
    windSpeedMps?: number;
}): {
    snapshot: WeatherSnapshot;
    original: WeatherSnapshot;
    overridden: string[];
} {
    if (Object.keys(changes).some(k => !['airTempC', 'dewPointC', 'relativeHumidityPct', 'windSpeedMps'].includes(k)))
        throw Error('Unsupported weather override');
    const s = { ...original, ...changes };
    if (s.airTempC !== null && !valid(s.airTempC, -40, 50) || s.dewPointC !== null && !valid(s.dewPointC, -40, 50) || s.relativeHumidityPct !== null && !valid(s.relativeHumidityPct, 0, 100) || s.windSpeedMps !== null && !valid(s.windSpeedMps, 0, 100))
        throw Error('Weather override outside supported range');
    if (changes.dewPointC !== undefined) {
        if (s.airTempC !== null && s.dewPointC! > s.airTempC)
            throw Error('Dew point cannot exceed air temperature');
        const implied = s.airTempC === null ? null : 100 * vaporPressureKPa(s.dewPointC!)! / vaporPressureKPa(s.airTempC)!;
        if (changes.relativeHumidityPct !== undefined && implied !== null && Math.abs(implied - changes.relativeHumidityPct) > 3)
            throw Error('Dew point and humidity are inconsistent');
        s.relativeHumidityPct = implied;
    }
    else if (changes.airTempC !== undefined || changes.relativeHumidityPct !== undefined)
        s.dewPointC = s.airTempC !== null && s.relativeHumidityPct !== null ? dewPointFromRH(s.airTempC, s.relativeHumidityPct) : null;
    s.actualVaporPressureKPa = s.dewPointC === null ? null : vaporPressureKPa(s.dewPointC);
    return { original, snapshot: s, overridden: Object.keys(changes) };
}
