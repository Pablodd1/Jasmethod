import { providerFetch } from "./provider-fetch";
import { createHash } from "crypto";
import { dateKey, DEFAULT_TIMEZONE } from "./dates";
import { XMLParser } from "fast-xml-parser";
// Data importers: Garmin TCX, Apple Health XML (export.xml), Whoop CSV,
// Strava API (OAuth), and 23andMe/Ancestry DNA raw files.
// All return normalized shapes the app stores in its own schema.

export interface ImportedWorkout {
  externalId: string;
  sport: "swim" | "bike" | "run" | "strength" | "other";
  date: Date;
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  calories?: number;
  title: string;
  source: string;
  raw?: unknown;
}

// ---------- Garmin TCX (Training Center XML) ----------
// TCX is Garmin's XML export format (also produced by Strava, TrainingPeaks,
// and most platforms for "download original"). Simple, robust XML parse.
export function parseTcx(xml: string): ImportedWorkout[] {
  const workouts: ImportedWorkout[] = [];
  const sportMatch = /sport="([^"]+)"/gi;
  const activityRegex = /<Activity[^>]*>([\s\S]*?)<\/Activity>/g;
  const trackpointRegex = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;
  const timeRegex = /<Time>([^<]+)<\/Time>/;
  const hrRegex =
    /<HeartRateBpm[^>]*>[\s\S]*?<Value>(\d+)<\/Value>[\s\S]*?<\/HeartRateBpm>/;
  const distRegex = /<DistanceMeters>([\d.]+)<\/DistanceMeters>/;
  const calRegex = /<Calories>(\d+)<\/Calories>/;
  const powerRegex = /<Watts>([\d.]+)<\/Watts>/;

  let m: RegExpExecArray | null;
  const sports: string[] = [];
  while ((m = sportMatch.exec(xml)) !== null) sports.push(m[1]);

  let actIdx = 0;
  while ((m = activityRegex.exec(xml)) !== null) {
    const block = m[1];
    const sportRaw = (sports[actIdx] || "other").toLowerCase();
    actIdx++;
    const sport: ImportedWorkout["sport"] = sportRaw.includes("swim")
      ? "swim"
      : sportRaw.includes("running")
        ? "run"
        : sportRaw.includes("biking") || sportRaw.includes("cycling")
          ? "bike"
          : sportRaw.includes("strength")
            ? "strength"
            : "other";

    const times: string[] = [];
    const hrs: number[] = [];
    let lastDist = 0;
    const powers: number[] = [];
    let tp: RegExpExecArray | null;
    while ((tp = trackpointRegex.exec(block)) !== null) {
      const tpt = tp[1];
      const t = tpt.match(timeRegex);
      if (t) times.push(t[1]);
      const h = tpt.match(hrRegex);
      if (h) hrs.push(parseInt(h[1], 10));
      const d = tpt.match(distRegex);
      if (d) lastDist = parseFloat(d[1]);
      const p = tpt.match(powerRegex);
      if (p) powers.push(parseFloat(p[1]));
    }
    if (times.length === 0) continue;
    const start = new Date(times[0]);
    const end = new Date(times[times.length - 1]);
    const durationMin = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 60000),
    );
    const cal = block.match(calRegex);
    const avgHr = hrs.length
      ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)
      : undefined;
    const maxHr = hrs.length ? Math.max(...hrs) : undefined;
    const avgPower = powers.length
      ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length)
      : undefined;
    const idBase =
      block.match(/<Id>([^<]+)<\/Id>/)?.[1] ||
      `${start.toISOString()}-${sport}`;

    workouts.push({
      externalId: `tcx:${idBase}`,
      sport,
      date: start,
      durationMin,
      distanceKm: lastDist > 0 ? Math.round(lastDist / 10) / 100 : undefined,
      avgHr,
      maxHr,
      avgPower,
      calories: cal ? parseInt(cal[1], 10) : undefined,
      title: `${sport[0].toUpperCase()}${sport.slice(1)} Activity`,
      source: "garmin",
    });
  }
  return workouts;
}

// ---------- Apple Health export.xml ----------
// Parse HKQuantityTypeIdentifier workouts + HKCharacteristicType + body mass.
export interface AppleHealthData {
  workouts: ImportedWorkout[];
  bodyMassKg?: number;
  heightCm?: number;
  stepCount?: number;
  sleepHours?: number;
  restingHr?: number;
  hrv?: number;
  weightLogs: { date: Date; kg: number }[];
  sleepLogs: { date: Date; hours: number }[];
  hrLogs: { date: Date; bpm: number }[];
  hrvLogs: { date: Date; ms: number }[];
}

export function parseAppleHealth(xml: string): AppleHealthData {
  const out: AppleHealthData = {
    workouts: [],
    weightLogs: [],
    sleepLogs: [],
    hrLogs: [],
    hrvLogs: [],
  };
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    processEntities: false,
  }).parse(xml).HealthData;
  if (!parsed) throw new Error("Expected an Apple Health export.xml file");
  const list = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
  for (const r of list(parsed.Record)) {
    const date = new Date(r.startDate),
      value = Number(r.value),
      type = String(r.type || "");
    if (!Number.isFinite(date.getTime()) || !Number.isFinite(value)) continue;
    if (type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN")
      out.hrvLogs.push({ date, ms: value });
    else if (type === "HKQuantityTypeIdentifierRestingHeartRate") {
      out.restingHr = value;
      out.hrLogs.push({ date, bpm: value });
    } else if (type === "HKQuantityTypeIdentifierBodyMass") {
      const kg =
        r.unit === "lb" ? value * 0.45359237 : r.unit === "kg" ? value : null;
      if (kg != null) {
        out.weightLogs.push({ date, kg });
        out.bodyMassKg = kg;
      }
    } else if (type === "HKQuantityTypeIdentifierHeight")
      out.heightCm =
        r.unit === "m"
          ? value * 100
          : r.unit === "cm"
            ? value
            : r.unit === "in"
              ? value * 2.54
              : undefined;
  }
  const sleepIntervals = list(parsed.Record)
    .filter(
      (r) =>
        r.type === "HKCategoryTypeIdentifierSleepAnalysis" &&
        /Asleep/.test(String(r.value)),
    )
    .map((r) => ({ date: new Date(r.startDate), end: new Date(r.endDate) }))
    .filter((r) => Number.isFinite(r.date.getTime()) && r.end > r.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  let previousEnd = 0;
  for (const r of sleepIntervals) {
    const start = Math.max(previousEnd, r.date.getTime());
    if (r.end.getTime() > start)
      out.sleepLogs.push({
        date: r.end,
        hours: (r.end.getTime() - start) / 3600000,
      });
    previousEnd = Math.max(previousEnd, r.end.getTime());
  }
  for (const w of list(parsed.Workout)) {
    const date = new Date(w.startDate),
      end = new Date(w.endDate);
    if (!Number.isFinite(date.getTime())) continue;
    const duration = Number(w.duration),
      unit = String(w.durationUnit || "");
    const minutes =
      unit === "min"
        ? duration
        : unit === "s"
          ? duration / 60
          : unit === "hr"
            ? duration * 60
            : (end.getTime() - date.getTime()) / 60000;
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const type = String(w.workoutActivityType || "");
    const sport: ImportedWorkout["sport"] = type.includes("Running")
      ? "run"
      : type.includes("Cycling")
        ? "bike"
        : type.includes("Swimming")
          ? "swim"
          : type.includes("Strength")
            ? "strength"
            : "other";
    const stat = list(w.WorkoutStatistics).find((s) =>
      String(s.type).includes("Distance"),
    );
    const distance = Number(w.totalDistance ?? stat?.sum),
      distanceUnit = w.totalDistanceUnit ?? stat?.unit;
    const distanceKm = Number.isFinite(distance)
      ? distanceUnit === "mi"
        ? distance * 1.609344
        : distanceUnit === "m"
          ? distance / 1000
          : distanceUnit === "km"
            ? distance
            : undefined
      : undefined;
    out.workouts.push({
      externalId: `apple:${w.startDate}:${sport}`,
      date,
      sport,
      title: `${sport} (Apple Health)`,
      durationMin: Math.max(1, Math.round(minutes)),
      distanceKm,
      calories:
        w.totalEnergyBurnedUnit === "kcal"
          ? Number(w.totalEnergyBurned) || undefined
          : undefined,
      source: "apple",
    });
  }
  return out;
}

// ---------- Whoop CSV export ----------
// Whoop exports a "cycle" CSV (recovery, strain) and "physiological" CSV.
// We parse the standard "cycle" columns: Cycle, Day, Recovery Score, Resting HR, HRV, Strain, Sleep Performance.
export interface WhoopCycle {
  day: string;
  recoveryScore?: number;
  restingHr?: number;
  hrv?: number;
  strain?: number;
  sleepPerformance?: number;
  sleepHours?: number;
  calories?: number;
}

export function parseWhoopCsv(csv: string): WhoopCycle[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const idx = (name: string) =>
    header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
  const cycles: WhoopCycle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cells[j] : undefined;
    };
    const day = get("Day") || get("Cycle");
    if (!day) continue;
    const num = (s?: string) =>
      s && !isNaN(parseFloat(s)) ? parseFloat(s) : undefined;
    cycles.push({
      day,
      recoveryScore: num(get("Recovery Score")),
      restingHr: num(get("Resting HR")),
      hrv: num(get("HRV")),
      strain: num(get("Strain")),
      sleepPerformance: num(get("Sleep Performance")),
      sleepHours: num(get("Sleep Duration")),
      calories: num(get("Calories Burned")),
    });
  }
  return cycles;
}

// ---------- Strava API ----------
export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function stravaAuthUrl(cfg: StravaConfig): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "read,activity:read_all,profile:read_all",
    approval_prompt: "auto",
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function stravaExchangeToken(
  cfg: StravaConfig,
  code: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: any;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const resp = await providerFetch(
    "https://www.strava.com/api/v3/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  if (!resp.ok)
    throw new Error(`Strava token exchange failed: ${resp.status} `);
  return resp.json();
}

export async function stravaRefreshToken(
  cfg: StravaConfig,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_at: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await providerFetch(
    "https://www.strava.com/api/v3/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  if (!resp.ok) throw new Error(`Strava refresh failed: ${resp.status}`);
  return resp.json();
}

export async function stravaGetActivities(
  accessToken: string,
  after?: Date,
  perPage = 100,
): Promise<any[]> {
  const out: any[] = [];
  perPage = Math.min(200, Math.max(1, perPage));
  for (let page = 1; page <= 100; page++) {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    if (after) params.set("after", String(Math.floor(after.getTime() / 1000)));
    const r = await providerFetch(
      `https://www.strava.com/api/v3/athlete/activities?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) throw new Error(`Strava activities failed: ${r.status}`);
    const batch = await r.json();
    if (!Array.isArray(batch))
      throw new Error("Invalid Strava activity response");
    out.push(...batch);
    if (batch.length < perPage) return out;
  }
  throw new Error("Activity history too large. Import a smaller date range.");
}

export function stravaActivityToWorkout(a: any): ImportedWorkout {
  const type = (a.type || "").toLowerCase();
  const sport: ImportedWorkout["sport"] = type.includes("swim")
    ? "swim"
    : type.includes("ride") || type.includes("bike")
      ? "bike"
      : type.includes("run")
        ? "run"
        : type.includes("workout") || type.includes("weight")
          ? "strength"
          : "other";
  return {
    externalId: `strava:${a.id}`,
    sport,
    date: new Date(a.start_date),
    durationMin: Math.round((a.moving_time || 0) / 60),
    distanceKm: a.distance ? Math.round(a.distance / 10) / 100 : undefined,
    avgHr: a.average_heartrate || undefined,
    maxHr: a.max_heartrate || undefined,
    avgPower: a.average_watts || undefined,
    calories: a.calories || undefined,
    title: a.name || `${sport[0].toUpperCase()}${sport.slice(1)} Activity`,
    source: "strava",
  };
}

// GET a single activity by ID — used by webhook-driven create/update so
// edits to older activities (outside the sync window) are not lost.
export async function stravaGetActivity(
  accessToken: string,
  id: string | number,
): Promise<any> {
  const r = await providerFetch(`https://www.strava.com/api/v3/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Strava activity ${id} failed: ${r.status}`);
  return r.json();
}

// ---------- 23andMe / Ancestry DNA raw ----------
// Format: tab-separated: rsid, chromosome, position, genotype
export interface DNAVariantRaw {
  rsid: string;
  chromosome: string;
  position: string;
  genotype: string;
}

export function parseDnaRaw(text: string): DNAVariantRaw[] {
  const variants: DNAVariantRaw[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#") || line.startsWith("rsid"))
      continue;
    const parts = line.split(/\t/);
    if (parts.length < 4) continue;
    const [rsid, chromosome, position, genotype] = parts.map((p) => p.trim());
    if (!rsid || !rsid.startsWith("rs") || !genotype) continue;
    variants.push({
      rsid,
      chromosome,
      position,
      genotype: genotype.replace(/\s+/g, ""),
    });
  }
  return variants;
}

// Ambiguous allele normalization: 23andMe uses ATGC; Ancestry may use I/D for ACE.
// For rs4646994 (ACE I/D), Ancestry reports "I"/"D"; 23andMe reports actual bases.
export function normalizeGenotype(rsid: string, g: string): string {
  const up = g.toUpperCase();
  if (rsid === "rs4646994") {
    if (up.includes("I") && up.includes("D")) return "ID";
    if (up === "II") return "II";
    if (up === "DD") return "DD";
  }
  // Sort alleles for consistent lookup (e.g. "CT" vs "TC")
  if (up.length === 2) {
    return up.split("").sort().join("");
  }
  return up;
}

// ---------- Garmin Connect OAuth2 (official Developer Program) ----------
// Auth: OAuth 2.0 with PKCE. Register an app at developer.garmin.com to get
// client id/secret. Same shape as Strava integration so the connectors UI
// can treat it identically.
export interface GarminConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Garmin Health API — OAuth 2.0 with PKCE (verified against developer.garmin.com
// + openwearables.io guide, 2026-08). Authorize = connect.garmin.com/oauth2Confirm,
// token = diauth.garmin.com/di-oauth2-service/oauth/token, data = apis.garmin.com
// wellness-api (push-based: real-time data arrives via webhook after connect;
// endpoints below are the pull/backfill surface). Requires HISTORICAL_DATA_EXPORT
// permission granted at connect or backfill returns 403.
export function garminAuthUrl(cfg: GarminConfig, state: string): string {
  // PKCE S256: verifier is generated per-attempt and must be sent to
  // garminExchangeToken. Simplification: stateless flow uses state only —
  // add code_challenge when a per-user verifier store exists.
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    state,
  });
  return `https://connect.garmin.com/oauth2Confirm?${params.toString()}`;
}

export async function garminExchangeToken(
  cfg: GarminConfig,
  code: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });
  const resp = await providerFetch(
    "https://diauth.garmin.com/di-oauth2-service/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
  );
  if (!resp.ok)
    throw new Error(`Garmin token exchange failed: ${resp.status} `);
  return resp.json();
}

export async function garminRefreshToken(
  cfg: GarminConfig,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await providerFetch(
    "https://diauth.garmin.com/di-oauth2-service/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
  );
  if (!resp.ok) throw new Error(`Garmin refresh failed: ${resp.status} `);
  return resp.json();
}

// Garmin Health API is push-based (no polling): data arrives at our webhook
// when the watch syncs. This is the authenticated backfill surface.
export async function garminGetActivities(
  accessToken: string,
  _after?: Date,
): Promise<any[]> {
  const resp = await providerFetch(
    "https://apis.garmin.com/wellness-api/rest/activityDetails",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  if (!resp.ok) throw new Error(`Garmin activities failed: ${resp.status} `);
  const data = await resp.json();
  return Array.isArray(data) ? data : data.activities || [];
}

export function garminActivityToWorkout(a: any): ImportedWorkout {
  // Health-API activity payloads nest under `activity`; tolerate both shapes.
  const act = a.activity || a;
  const type = (act.activityType || act.activityId || act.type || "")
    .toString()
    .toLowerCase();
  const sport: ImportedWorkout["sport"] = type.includes("swim")
    ? "swim"
    : type.includes("cycling") || type.includes("bike")
      ? "bike"
      : type.includes("run")
        ? "run"
        : type.includes("strength")
          ? "strength"
          : "other";
  const durationSec =
    act.durationInSeconds ?? act.duration ?? a.durationInSeconds ?? 0;
  return {
    externalId: String(
      act.activityId ||
        act.id ||
        a.summaryId ||
        `${Date.now()}-${Math.random()}`,
    ),
    sport,
    date: new Date(
      (act.startTimeInSeconds ?? a.startTimeInSeconds ?? Date.now() / 1000) *
        1000,
    ),
    durationMin: Math.round(durationSec / 60),
    distanceKm: act.distanceInMeters ? act.distanceInMeters / 1000 : undefined,
    avgHr: act.averageHr ?? act.averageHeartRateInBeatsPerMinute,
    maxHr: act.maxHr ?? act.maxHeartRateInBeatsPerMinute,
    avgPower: act.averagePowerInWatts,
    calories: act.calories ?? act.activeKilocalories,
    title: act.activityName || type || "Activity",
    source: "garmin",
  };
}

// ---------- Google Calendar OAuth2 (read availability) ----------
// Scope: read-only calendar so the smart coach sees meetings/blocked time
// and can fit training into the user's real schedule.
export interface GoogleCalConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function googleCalAuthUrl(cfg: GoogleCalConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events", // read + write: we also publish the training plan
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function googleCalExchangeToken(
  cfg: GoogleCalConfig,
  code: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });
  const resp = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok)
    throw new Error(`Google token exchange failed: ${resp.status} `);
  return resp.json();
}

export async function googleCalRefreshToken(
  cfg: GoogleCalConfig,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Google refresh failed: ${resp.status} `);
  return resp.json();
}

// Fetch upcoming events from primary calendar (default 14 days).
export async function googleCalGetEvents(
  accessToken: string,
  days = 14,
  start = new Date(),
): Promise<any[]> {
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: new Date(start.getTime() + days * 86400000).toISOString(),
    singleEvents: "true",
    showDeleted: "true",
    maxResults: "250",
  });
  const out: any[] = [];
  for (let i = 0; i < 100; i++) {
    const r = await providerFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) throw new Error(`Google Calendar failed: ${r.status}`);
    const data = await r.json();
    out.push(...(data.items || []));
    if (!data.nextPageToken) return out;
    params.set("pageToken", data.nextPageToken);
  }
  throw new Error(
    "Calendar pagination limit exceeded; no incomplete snapshot was saved.",
  );
}

// ---------- OURA (cloud.ouraring.com v2 — OAuth2 only) ----------

export interface OuraConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function ouraAuthUrl(cfg: OuraConfig): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "daily",
  });
  return `https://cloud.ouraring.com/oauth/authorize?${params.toString()}`;
}

export async function ouraExchangeToken(
  cfg: OuraConfig,
  code: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await providerFetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Oura token exchange failed: ${resp.status} `);
  return resp.json();
}

export async function ouraRefreshToken(
  cfg: OuraConfig,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await providerFetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Oura token refresh failed: ${resp.status}`);
  return resp.json();
}

// One normalized daily row from Oura sleep + readiness documents.
export interface OuraDaily {
  date: string;
  hrv: number | null;
  restingHr: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  readiness: number | null;
}

export async function ouraGetDaily(
  accessToken: string,
  days = 30,
): Promise<OuraDaily[]> {
  const params = new URLSearchParams({
    start_date: new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  });
  const get = async (kind: string) => {
    const query = new URLSearchParams(params),
      out: any[] = [];
    for (let i = 0; i < 100; i++) {
      const r = await providerFetch(
        `https://api.ouraring.com/v2/usercollection/${kind}?${query}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!r.ok) throw new Error(`Oura ${kind} failed: ${r.status}`);
      const d = await r.json();
      out.push(...(d.data || []));
      if (!d.next_token) return out;
      query.set("next_token", d.next_token);
    }
    throw new Error("Oura pagination limit exceeded");
  };
  const [sleep, readiness, scores] = await Promise.all([
    get("sleep"),
    get("daily_readiness"),
    get("daily_sleep"),
  ]);
  const byDay = new Map<string, OuraDaily>();
  const row = (key: string) =>
    byDay.get(key) || {
      date: key,
      hrv: null,
      restingHr: null,
      sleepScore: null,
      sleepHours: null,
      readiness: null,
    };
  for (const s of sleep.filter((s) => !s.type || s.type === "long_sleep")) {
    const d = row(s.day);
    d.hrv = s.average_hrv ?? null;
    d.restingHr = s.lowest_heart_rate ?? null;
    d.sleepHours =
      s.total_sleep_duration != null ? s.total_sleep_duration / 3600 : null;
    byDay.set(s.day, d);
  }
  for (const s of readiness) {
    const d = row(s.day);
    d.readiness = s.score ?? null;
    byDay.set(s.day, d);
  }
  for (const s of scores) {
    const d = row(s.day);
    d.sleepScore = s.score ?? null;
    byDay.set(s.day, d);
  }
  return Array.from(byDay.values());
}

// ---------- WHOOP (developer.whoop.com — OAuth2) ----------

export interface WhoopConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function whoopAuthUrl(cfg: WhoopConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "read:recovery read:sleep read:cycles read:profile offline",
    state,
  });
  return `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString()}`;
}

export async function whoopExchangeToken(
  cfg: WhoopConfig,
  code: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await providerFetch(
    "https://api.prod.whoop.com/oauth/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  if (!resp.ok) throw new Error(`Whoop token exchange failed: ${resp.status} `);
  return resp.json();
}

export async function whoopRefreshToken(
  cfg: WhoopConfig,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await providerFetch(
    "https://api.prod.whoop.com/oauth/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  if (!resp.ok) throw new Error(`Whoop token refresh failed: ${resp.status}`);
  return resp.json();
}

// Recovery + sleep per cycle day, normalized.
export interface WhoopDaily {
  date: string;
  recoveryScore: number | null;
  hrv: number | null;
  restingHr: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
}

export async function whoopGetDaily(
  accessToken: string,
  days = 30,
  timezone = DEFAULT_TIMEZONE,
): Promise<WhoopDaily[]> {
  const get = async (path: string) => {
    const params = new URLSearchParams({
        start: new Date(Date.now() - days * 86400000).toISOString(),
        end: new Date().toISOString(),
        limit: "25",
      }),
      out: any[] = [];
    for (let i = 0; i < 100; i++) {
      const r = await providerFetch(
        `https://api.prod.whoop.com/developer/v2/${path}?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!r.ok) throw new Error(`Whoop ${path} failed: ${r.status}`);
      const d = await r.json();
      out.push(...(d.records || []));
      if (!d.next_token) return out;
      params.set("nextToken", d.next_token);
    }
    throw new Error("Whoop pagination limit exceeded");
  };
  const [sleeps, recovery] = await Promise.all([
    get("activity/sleep"),
    get("recovery"),
  ]);
  const out = new Map<string, WhoopDaily>(),
    sleepDays = new Map<string, string>();
  const row = (key: string) =>
    out.get(key) || {
      date: key,
      recoveryScore: null,
      hrv: null,
      restingHr: null,
      sleepScore: null,
      sleepHours: null,
    };
  for (const s of sleeps) {
    if (!s.end) continue;
    const day = dateKey(new Date(s.end), timezone);
    sleepDays.set(String(s.id), day);
    if (s.nap) continue;
    const d = row(day),
      stage = s.score?.stage_summary;
    d.sleepScore = s.score?.sleep_performance_percentage ?? null;
    if (stage)
      d.sleepHours =
        ((stage.total_light_sleep_time_milli || 0) +
          (stage.total_slow_wave_sleep_time_milli || 0) +
          (stage.total_rem_sleep_time_milli || 0)) /
        3600000;
    out.set(day, d);
  }
  for (const c of recovery) {
    const day = sleepDays.get(String(c.sleep_id));
    if (!day) continue;
    const d = row(day);
    d.hrv = c.score?.hrv_rmssd_milli ?? null;
    d.restingHr = c.score?.resting_heart_rate ?? null;
    d.recoveryScore = c.score?.recovery_score ?? null;
    out.set(day, d);
  }
  return Array.from(out.values());
}

// WHOOP completed workouts (v2 API) — the activity half of WHOOP ingestion.
// Returns each workout's external id (`whoop:<id>`), timing, strain kcal and
// heart rates for storeActivity; sport is "other" (WHOOP doesn't expose the
// activity type as a Jasmethod sport) and the title marks the strain level.
export interface WhoopWorkout {
  externalId: string;
  start: Date;
  end: Date;
  durationMin: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  strain?: number;
  title: string;
}

export async function whoopGetWorkouts(
  accessToken: string,
  days = 30,
): Promise<WhoopWorkout[]> {
  const out: WhoopWorkout[] = [];
  let nextToken: string | undefined;
  for (let i = 0; i < 20; i++) {
    const params = new URLSearchParams({
      start: new Date(Date.now() - days * 86400000).toISOString(),
      end: new Date().toISOString(),
      limit: "25",
    });
    if (nextToken) params.set("nextToken", nextToken);
    const r = await providerFetch(
      `https://api.prod.whoop.com/developer/v2/activity/workout?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) throw new Error(`Whoop workouts failed: ${r.status}`);
    const d = await r.json();
    for (const w of d.records || []) {
      if (!w.start || !w.end) continue;
      const startMs = new Date(w.start).getTime();
      const endMs = new Date(w.end).getTime();
      out.push({
        externalId: `whoop:${w.id}`,
        start: new Date(w.start),
        end: new Date(w.end),
        durationMin: Math.max(1, Math.round((endMs - startMs) / 60000)),
        avgHr: w.score?.average_heart_rate || undefined,
        maxHr: w.score?.max_heart_rate || undefined,
        calories: w.score?.kilocalories != null ? Math.round(w.score.kilocalories) : undefined,
        strain: w.score?.strain || undefined,
        title: w.score?.strain != null ? `WHOOP Workout (strain ${Math.round(w.score.strain)})` : "WHOOP Workout",
      });
    }
    if (!d.next_token) return out;
    nextToken = d.next_token;
  }
  return out;
}

// ---------- Garmin Connect "Activities.csv" (activity export) ----------
// Parses the CSV you get from Garmin Connect → Activities → Export CSV
// (columns: Activity Type, Date, Title, Distance, Calories, Time, Avg HR,
// Max HR, Avg Power, NP, TSS, ...). Distances: km for run/bike, meters for
// swims (Garmin exports swims in meters with thousands separators).
export interface GarminActivity {
  date: Date;
  sport: "swim" | "bike" | "run";
  title: string;
  durationMin: number;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  np: number | null;
  tss: number | null;
  calories: number | null;
  externalId: string;
}

function csvSplit(line: string): string[] {
  const out: string[] = [];
  let cur = "",
    inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseGarminActivitiesCsv(csv: string): GarminActivity[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = csvSplit(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h === name);
  const iType = idx("Activity Type"),
    iDate = idx("Date"),
    iTitle = idx("Title"),
    iDist = idx("Distance"),
    iCal = idx("Calories"),
    iTime = idx("Time"),
    iAvgHr = idx("Avg HR"),
    iMaxHr = idx("Max HR"),
    iAvgPwr = idx("Avg Power"),
    iNP = header.findIndex((h) => h.startsWith("Normalized Power")),
    iTss = header.findIndex((h) => h.startsWith("Training Stress Score"));

  const num = (v: string | undefined): number | null => {
    if (v == null) return null;
    const clean = v
      .replace(/,/g, "")
      .replace(/^'-/, "-")
      .replace(/'/g, "")
      .trim();
    if (clean === "" || clean === "--") return null;
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  };

  const out: GarminActivity[] = [];
  for (const line of lines.slice(1)) {
    const c = csvSplit(line);
    const type = (c[iType] || "").trim();
    const sport: GarminActivity["sport"] | null = /Swim/i.test(type)
      ? "swim"
      : /Cycling|Bike/i.test(type)
        ? "bike"
        : /Run|Jog|Walk/i.test(type)
          ? "run"
          : null;
    if (!sport) continue; // skip strength/other rows the app can't use yet
    const dateStr = (c[iDate] || "").trim();
    const date = new Date(dateStr.replace(" ", "T"));
    if (isNaN(date.getTime())) continue;
    const timeStr = (c[iTime] || "").trim();
    const tm = timeStr.match(/^(\d+):(\d+):(\d+)/);
    if (!tm) continue;
    const durationMin = Math.round((+tm[1] * 3600 + +tm[2] * 60 + +tm[3]) / 60);
    const rawDist = num(c[iDist]);
    // Garmins: swims in METERS (e.g. "1,620"), run/bike in KM (e.g. "54.09").
    const distanceKm =
      rawDist == null
        ? null
        : sport === "swim"
          ? Math.round((rawDist / 1000) * 100) / 100
          : rawDist;
    const title = (c[iTitle] || type).trim();
    out.push({
      date,
      sport,
      title,
      durationMin,
      distanceKm,
      avgHr: num(c[iAvgHr]),
      maxHr: num(c[iMaxHr]),
      avgPower: num(c[iAvgPwr]),
      np: num(iNP >= 0 ? c[iNP] : undefined),
      tss: num(iTss >= 0 ? c[iTss] : undefined),
      calories: num(c[iCal]),
      externalId: `garmin-csv:${dateStr}:${title}`,
    });
  }
  return out;
}

// ---------- Google Calendar: publish training sessions (write) ----------
const GCAL_API =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface GcalEventInput {
  summary: string;
  description?: string;
  start: Date;
  durationMin: number;
  workoutId: string;
  existingGoogleId?: string | null; // when set, update instead of create
}

export async function googleCalUpsertEvent(
  accessToken: string,
  ev: GcalEventInput,
): Promise<string> {
  const id =
    ev.existingGoogleId ||
    createHash("sha256").update(ev.workoutId).digest("hex");
  const body = {
    summary: ev.summary,
    description: ev.description || "",
    start: { dateTime: ev.start.toISOString() },
    end: {
      dateTime: new Date(
        ev.start.getTime() + ev.durationMin * 60000,
      ).toISOString(),
    },
    extendedProperties: { private: { jmmWorkoutId: ev.workoutId } },
  };
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  let r = await providerFetch(`${GCAL_API}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (r.status === 404 || r.status === 410) {
    r = await providerFetch(GCAL_API, {
      method: "POST",
      headers,
      body: JSON.stringify({ id, ...body }),
    });
    if (r.status === 409)
      r = await providerFetch(`${GCAL_API}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
  }
  if (!r.ok) throw new Error(`Google Calendar publish failed: ${r.status}`);
  return (await r.json()).id || id;
}
export async function googleCalDeleteEvent(accessToken: string, id: string) {
  const r = await providerFetch(`${GCAL_API}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok && r.status !== 404 && r.status !== 410)
    throw new Error(`Google Calendar delete failed: ${r.status}`);
}
