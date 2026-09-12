// JasMiamiMethod — weather + geocoding (Open-Meteo).
// Free, no API key, hourly resolution — ideal for race-day conditions at an
// exact start hour (https://open-meteo.com — 10k calls/day non-commercial).

export interface RaceWeather {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  windDir: number;
  gustsKph: number;
  precipMm: number;
  condition: string;
  hourlyMatched: string; // ISO hour used
  solarWm2?: number;     // shortwave radiation (drives the WBGT globe estimate)
  cloudCover?: number;   // %
  wbgt?: WbgtResult;     // computed wet-bulb globe temperature
}

const cache = new Map<string, { at: number; data: RaceWeather | null }>();
const TTL = 30 * 60 * 1000; // 30 min

// Geocode a free-text venue to lat/lng. Retries with progressively shorter
// queries ("Daytona International Speedway, FL" -> "Daytona International
// Speedway" -> "Daytona") because venue names often miss the geocoder.
export async function geocodeLocation(name: string): Promise<{ lat: number; lng: number; label: string } | null> {
  let query = name.trim();
  for (let attempt = 0; attempt < 3 && query.length >= 3; attempt++) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) {
      const data = await res.json();
      const hit = data?.results?.[0];
      if (hit) return { lat: hit.latitude, lng: hit.longitude, label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ") };
    }
    const comma = query.lastIndexOf(",");
    if (comma > 0) query = query.slice(0, comma).trim();
    else { const words = query.split(" "); words.pop(); query = words.join(" "); }
  }
  return null;
}

// Hourly conditions at (lat,lng) for the given race date + start hour (local
// race time). Open-Meteo returns the location's local hours; we match by the
// hour-of-day closest to the race start.
export async function getRaceWeather(lat: number, lng: number, date: Date, startHourLocal: number): Promise<RaceWeather | null> {
  const key = `${lat.toFixed(3)}:${lng.toFixed(3)}:${date.toISOString().slice(0, 10)}:${startHourLocal}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const dateStr = date.toISOString().slice(0, 10);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,shortwave_radiation,cloud_cover` +
    `&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json();
  const h = data?.hourly;
  if (!h?.time?.length) return null;

  // Match the race start hour in the venue's own timezone (h.time is local).
  let best = 0, bestDiff = 99;
  h.time.forEach((t: string, i: number) => {
    const hour = Number(t.slice(11, 13));
    const diff = Math.min(Math.abs(hour - startHourLocal), 24 - Math.abs(hour - startHourLocal));
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  });

  const CODES: Record<number, string> = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 51: "drizzle", 61: "rain", 63: "rain", 65: "heavy rain", 71: "snow", 80: "showers", 95: "storm" };
  const w: RaceWeather = {
    tempC: Math.round(h.temperature_2m[best] * 10) / 10,
    feelsLikeC: Math.round((h.apparent_temperature?.[best] ?? h.temperature_2m[best]) * 10) / 10,
    humidity: Math.round(h.relative_humidity_2m?.[best] ?? 0),
    windKph: Math.round(h.wind_speed_10m?.[best] ?? 0),
    windDir: Math.round(h.wind_direction_10m?.[best] ?? 0),
    gustsKph: Math.round(h.wind_gusts_10m?.[best] ?? 0),
    precipMm: h.precipitation?.[best] ?? 0,
    condition: CODES[h.weather_code?.[best]] || "—",
    hourlyMatched: h.time[best],
  };
  const solar = h.shortwave_radiation?.[best];
  if (solar != null) w.solarWm2 = Math.round(solar);
  if (h.cloud_cover?.[best] != null) w.cloudCover = Math.round(h.cloud_cover[best]);
  w.wbgt = wbgtC({
    tempC: w.tempC,
    humidity: w.humidity,
    solarWm2: w.solarWm2,
    windKph: w.windKph,
  });
  cache.set(key, { at: Date.now(), data: w });
  return w;
}

// ---- Prediction adjustments (transparent, citable) ----
// Heat is modeled through WBGT (wet-bulb globe temperature), per the
// 2026-09-08 adjudication: the old linear °F+%RH formula was rejected as
// unsourced, and humidity interacts with temperature nonlinearly through
// evaporative cooling. All constants live in forecast-constants.ts with
// provenance flags.

import {
  WBGT_WEIGHTS,
  GLOBE_TEMP_EST_COEFFS,
} from "./forecast-constants";

// Dew point (Magnus formula, VERIFIED standard).
export function dewPointC(tC: number, rhPct: number): number {
  const gamma = Math.log(Math.max(1, rhPct) / 100) + (17.62 * tC) / (243.12 + tC);
  return (243.12 * gamma) / (17.62 - gamma);
}

// Wet-bulb temperature (Stull 2011 polynomial, VERIFIED standard; valid for
// typical endurance conditions, ±0.3°C vs psychrometric tables).
export function wetBulbC(tC: number, rhPct: number): number {
  const rh = Math.min(100, Math.max(1, rhPct));
  return (
    tC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

// Black-globe estimate from solar radiation + wind. This is the weak link in
// computed WBGT (the standard uses a real sensor) — flagged TUNED_DEFAULT.
// With no sun data we assume shaded/overcast: globe ≈ air temp.
export function globeTempEstC(tC: number, _rhPct: number, solarWm2?: number, windKph?: number): number {
  if (solarWm2 == null) return tC;
  const c = GLOBE_TEMP_EST_COEFFS.value as Record<string, number>;
  const solarRise = Math.min(c.solarCapC, (solarWm2 / 800) * c.solarCapC);
  const windCool = Math.min(c.windCapC, Math.max(0, (windKph ?? 5) - 5) * c.windCoolPerKph);
  return tC + solarRise - windCool;
}

export interface WbgtResult {
  wbgtC: number;
  wetBulbC: number;
  globeEstC: number;
  dewPointC: number;
  method: string; // provenance string for the UI
}

// Outdoor WBGT = 0.7·Tw + 0.2·Tg + 0.1·Td (ISO 7243 / ACSM, VERIFIED formula;
// Tg here is the TUNED_DEFAULT estimate above).
export function wbgtC(o: {
  tempC: number;
  humidity: number;
  solarWm2?: number;
  windKph?: number;
}): WbgtResult {
  const tw = wetBulbC(o.tempC, o.humidity);
  const tg = globeTempEstC(o.tempC, o.humidity, o.solarWm2, o.windKph);
  const td = dewPointC(o.tempC, o.humidity);
  const w = WBGT_WEIGHTS.value as Record<string, number>;
  const raw = w.tw * tw + w.tg * tg + w.td * td;
  // Sanity clamp — a globe estimate must not run away from air temp.
  const wbgt = Math.min(o.tempC + 8, Math.max(o.tempC - 6, raw));
  const r2 = (x: number) => Math.round(x * 10) / 10;
  return {
    wbgtC: r2(wbgt),
    wetBulbC: r2(tw),
    globeEstC: r2(tg),
    dewPointC: r2(td),
    method: "WBGT = 0.7·Tw + 0.2·Tg(est) + 0.1·Td (ISO 7243); Tg estimated from solar+wind (TUNED_DEFAULT)",
  };
}

// ACSM-style activity zones. Thresholds are HEURISTIC — VERIFY currency.
export function wbgtCategory(wbgt: number): {
  zone: "ok" | "red_flag" | "black_flag";
  note: string;
  verify: boolean;
} {
  if (wbgt > 28)
    return {
      zone: "black_flag",
      note: "WBGT > 28°C — black-flag conditions: high risk of exertional heat illness. Consider a major pace reset, aggressive cooling, and pre-race heat adaptation.",
      verify: true,
    };
  if (wbgt >= 23)
    return {
      zone: "red_flag",
      note: "WBGT 23–28°C — red-flag zone: pace targets should be eased and fluid/sodium plan enforced (ACSM-style bands — verify current guidance).",
      verify: true,
    };
  return {
    zone: "ok",
    note: "WBGT < 23°C — heat load is manageable with the planned fueling.",
    verify: false,
  };
}

// Linear interpolation between [anchor, fraction] pairs.
function interpCurve(anchors: number[], x: number, cap: number): number {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < anchors.length; i += 2) pairs.push([anchors[i], anchors[i + 1]]);
  if (x <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (x <= pairs[i][0]) {
      const [x0, y0] = pairs[i - 1];
      const [x1, y1] = pairs[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pairs[pairs.length - 1][1] + cap * 0; // beyond last anchor: hold last value
}

// Run pace penalty vs WBGT: tunable anchor curve (HEURISTIC — direction
// consistent with El Helou et al. 2012; NO universal linear slope exists).
export function runHeatPaceFactor(wbgt: number): number {
  const anchors = [15, 0, 20, 0.01, 24, 0.035, 28, 0.07, 32, 0.12];
  if (wbgt < 5) return 0.99; // very cold: slight benefit (TUNED_DEFAULT)
  return 1 + Math.min(0.18, interpCurve(anchors, wbgt, 0));
}

// Bike sustainable-power derate vs WBGT (TUNED_DEFAULT anchor curve).
export function bikeHeatPowerFactorFromWbgt(wbgt: number): number {
  const anchors = [15, 0, 20, -0.01, 24, -0.03, 28, -0.06, 32, -0.10];
  if (wbgt < 5) return 0.99;
  return 1 + Math.max(-0.15, interpCurve(anchors, wbgt, 0));
}

// Qualitative dew-point advisory ONLY (adjudication Conflict 3: no numeric
// penalties without a source).
export function dewPointAdvisory(dewC: number): string | null {
  if (dewC >= 21)
    return `Dew point ${dewC}°C — oppressive: evaporative cooling is heavily reduced. Expect the heat plan to understate stress; prioritize fluids over pace.`;
  if (dewC >= 16)
    return `Dew point ${dewC}°C — humid: sweat won't evaporate well. Bonus cooling (ice, water over head) matters more than usual.`;
  return null;
}

// Air density from venue elevation + temperature (VERIFIED physics):
// barometric pressure (troposphere) → ideal-gas density.
export function airDensity(elevM: number, tempC: number): number {
  const p = 101325 * Math.pow(1 - 2.25577e-5 * Math.max(0, elevM), 5.25588);
  return p / (287.05 * (tempC + 273.15));
}

// ---- Legacy adjustments (still used by reminders/calendar paths) ----
// NOTE: the race-forecast engine now uses the WBGT model above. These linear
// helpers are retained for existing callers; do not build NEW forecast logic
// on them.

// Heat: endurance performance degrades progressively above ~15°C dry temp.
export function heatFactor(tempC: number): number {
  if (tempC <= 15) return 1;
  const penalty = Math.min(0.15, ((tempC - 15) / 5) * 0.025);
  return 1 + penalty; // multiply predicted TIME
}
// Bike: heat derates sustainable power ~3%/5°C above neutral, cap 12%.
export function heatPowerFactor(tempC: number): number {
  if (tempC <= 15) return 1;
  return 1 + Math.min(0.12, ((tempC - 15) / 5) * 0.03);
}
// Wind: naive but honest — a course loop exposes ~half the time to headwind;
// headwind costs more than tailwind gains (aerodynamics), net +0.6%/10kph.
export function windFactor(windKph: number): number {
  if (windKph <= 8) return 1;
  return 1 + Math.min(0.08, ((windKph - 8) / 10) * 0.006 * 10);
}
