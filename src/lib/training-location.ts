/** City/postal-code search; never silently select the first ambiguous match. */
export interface TrainingLocation { label: string; latitude: number; longitude: number; timeZone: string }
export function isTrainingLocation(v: unknown): v is TrainingLocation {
  if (!v || typeof v !== "object") return false;
  const x = v as TrainingLocation;
  if (typeof x.label !== "string" || !x.label.trim() || x.label.length > 160 || /[\u0000-\u001f\u007f]/.test(x.label) || !Number.isFinite(x.latitude) || Math.abs(x.latitude) > 90 || !Number.isFinite(x.longitude) || Math.abs(x.longitude) > 180 || typeof x.timeZone !== "string") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: x.timeZone }).format(); return true; } catch { return false; }
}
export function locationSearchInput(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => k !== "query")) throw Error("Enter a city, state/region or postal code.");
  const q = (value as { query?: unknown }).query;
  if (typeof q !== "string" || q.trim().length < 2 || q.length > 120 || /[\u0000-\u001f\u007f]/.test(q)) throw Error("Enter a city or postal code (2–120 characters).");
  return q.trim();
}
export async function searchTrainingLocations(query: string, transport: typeof fetch = fetch): Promise<TrainingLocation[]> {
  const response = await transport(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`, { signal: AbortSignal.timeout(6000), redirect: "error", cache: "no-store" });
  if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw Error("Location search is unavailable. You can continue without weather.");
  const reader = response.body?.getReader(); if (!reader) throw Error("Location search is unavailable.");
  let size = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) throw Error("Location response is too large."); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (raw.error || (raw.results !== undefined && !Array.isArray(raw.results))) throw Error("Location search is unavailable.");
  return (raw.results ?? []).slice(0, 6).flatMap((r: Record<string, unknown>) => {
    if (!r || typeof r !== "object") return [];
    const location = { label: [r.name, r.admin1, r.country].filter(x => typeof x === "string" && x).join(", "), latitude: r.latitude, longitude: r.longitude, timeZone: r.timezone };
    return isTrainingLocation(location) ? [location] : [];
  });
}
