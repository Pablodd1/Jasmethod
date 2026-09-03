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
    `&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code` +
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
  cache.set(key, { at: Date.now(), data: w });
  return w;
}

// ---- Prediction adjustments (transparent, citable) ----
// Heat: endurance performance degrades progressively above ~15°C WBGT-ish dry
// temp; commonly quantified ~2-5% per +5°C for hard efforts (TrainingPeaks /
// heat studies). Run pace: ~2.5%/5°C above 15°C, capped at 15%.
export function heatFactor(tempC: number): number {
  if (tempC <= 15) return 1;
  const penalty = Math.min(0.15, ((tempC - 15) / 5) * 0.025);
  return 1 + penalty; // multiply predicted TIME
}
// Bike: heat derates sustainable power ~1-2% per 5°F above neutral; use ~3%/5°C cap 12%.
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
