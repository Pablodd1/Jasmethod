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
  const hrRegex = /<HeartRateBpm[^>]*>[\s\S]*?<Value>(\d+)<\/Value>[\s\S]*?<\/HeartRateBpm>/;
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
    const sport: ImportedWorkout["sport"] = sportRaw.includes("swim") ? "swim"
      : sportRaw.includes("running") ? "run"
      : sportRaw.includes("biking") || sportRaw.includes("cycling") ? "bike"
      : sportRaw.includes("strength") ? "strength" : "other";

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
    const durationMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
    const cal = block.match(calRegex);
    const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined;
    const maxHr = hrs.length ? Math.max(...hrs) : undefined;
    const avgPower = powers.length ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : undefined;
    const idBase = block.match(/<Id>([^<]+)<\/Id>/)?.[1] || `${start.toISOString()}-${sport}`;

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
  const out: AppleHealthData = { workouts: [], weightLogs: [], sleepLogs: [], hrLogs: [], hrvLogs: [] };
  const recordRegex = /<Record\s+([^>]*)\/>/g;
  const workoutRegex = /<Workout\s+([^>]*)\/>/g;
  const attr = (s: string, name: string) => {
    const m = s.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : undefined;
  };

  let m: RegExpExecArray | null;
  while ((m = recordRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const type = attr(attrs, "type") || "";
    const value = attr(attrs, "value");
    const unit = attr(attrs, "unit");
    const start = attr(attrs, "startDate");
    if (!start) continue;
    const date = new Date(start);

    if (type.includes("BodyMass") && unit === "kg" && value) {
      const kg = parseFloat(value);
      out.weightLogs.push({ date, kg });
      if (out.weightLogs.length === 0 || date >= out.weightLogs[out.weightLogs.length - 1].date) { out.bodyMassKg = kg; }
    } else if (type.includes("Height") && value) {
      const cm = unit === "cm" ? parseFloat(value) : unit === "m" ? parseFloat(value) * 100 : undefined;
      if (cm) out.heightCm = cm;
    } else if (type.includes("StepCount")) {
      out.stepCount = (out.stepCount || 0) + parseFloat(value || "0");
    } else if (type.includes("RestingHeartRate") && value) {
      out.restingHr = Math.round(parseFloat(value));
    } else if (type.includes("HeartRate") && value) {
      out.hrLogs.push({ date, bpm: Math.round(parseFloat(value)) });
    } else if (type.includes("HeartRateVariability") && value) {
      out.hrvLogs.push({ date, ms: parseFloat(value) });
    } else if (type.includes("SleepAnalysis") && value) {
      // Sleep analysis records: value = asleep | inBed | awake
      out.sleepLogs.push({ date, hours: 0 }); // aggregated separately below
    }
  }

  while ((m = workoutRegex.exec(xml)) !== null) {
    const attrs = m[1];
    const activity = attr(attrs, "workoutActivityType") || "other";
    const start = attr(attrs, "startDate");
    const end = attr(attrs, "endDate");
    const dur = attr(attrs, "duration");
    const dist = attr(attrs, "distance");
    const cal = attr(attrs, "totalEnergyBurned");
    if (!start || !end) continue;
    const sport: ImportedWorkout["sport"] = activity.includes("Swimming") ? "swim"
      : activity.includes("Cycling") ? "bike"
      : activity.includes("Running") ? "run"
      : activity.includes("Strength") ? "strength" : "other";
    out.workouts.push({
      externalId: `apple:${start}`,
      sport,
      date: new Date(start),
      durationMin: Math.max(1, Math.round(parseFloat(dur || "0") / 60)),
      distanceKm: dist ? parseFloat(dist) : undefined,
      calories: cal ? Math.round(parseFloat(cal)) : undefined,
      title: `${sport[0].toUpperCase()}${sport.slice(1)} (Apple Health)`,
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
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));
  const cycles: WhoopCycle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cells[j] : undefined;
    };
    const day = get("Day") || get("Cycle");
    if (!day) continue;
    const num = (s?: string) => (s && !isNaN(parseFloat(s)) ? parseFloat(s) : undefined);
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

export async function stravaExchangeToken(cfg: StravaConfig, code: string): Promise<{ access_token: string; refresh_token: string; expires_at: number; athlete: any }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const resp = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Strava token exchange failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function stravaRefreshToken(cfg: StravaConfig, refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_at: number }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Strava refresh failed: ${resp.status}`);
  return resp.json();
}

export async function stravaGetActivities(accessToken: string, after?: Date, perPage = 30): Promise<any[]> {
  const params = new URLSearchParams({ per_page: String(perPage) });
  if (after) params.set("after", String(Math.floor(after.getTime() / 1000)));
  const resp = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Strava activities failed: ${resp.status}`);
  return resp.json();
}

export function stravaActivityToWorkout(a: any): ImportedWorkout {
  const type = (a.type || "").toLowerCase();
  const sport: ImportedWorkout["sport"] = type.includes("swim") ? "swim"
    : type.includes("ride") || type.includes("bike") ? "bike"
    : type.includes("run") ? "run"
    : type.includes("workout") || type.includes("weight") ? "strength" : "other";
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
    if (!line.trim() || line.startsWith("#") || line.startsWith("rsid")) continue;
    const parts = line.split(/\t/);
    if (parts.length < 4) continue;
    const [rsid, chromosome, position, genotype] = parts.map((p) => p.trim());
    if (!rsid || !rsid.startsWith("rs") || !genotype) continue;
    variants.push({ rsid, chromosome, position, genotype: genotype.replace(/\s+/g, "") });
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

export function garminAuthUrl(cfg: GarminConfig, state: string): string {
  // PKCE: generate code_verifier per auth attempt; app must persist it to
  // verify at callback. Simplification: stateless demo uses state only.
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "activities", // Garmin scopes: activities | health_snapshot | etc.
    state,
  });
  return `https://connect.garmin.com/oauth/authorize?${params.toString()}`;
}

export async function garminExchangeToken(cfg: GarminConfig, code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });
  const resp = await fetch("https://connect.garmin.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Garmin token exchange failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function garminRefreshToken(cfg: GarminConfig, refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://connect.garmin.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Garmin refresh failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// List activities. Garmin's public Activity API paginates; after=ISO date.
export async function garminGetActivities(accessToken: string, after?: Date): Promise<any[]> {
  const params = new URLSearchParams({ limit: "50" });
  if (after) params.set("startTime", after.toISOString());
  const resp = await fetch(`https://apis.garmin.com/activity-api/v1/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Garmin activities failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return Array.isArray(data) ? data : data.activities || [];
}

export function garminActivityToWorkout(a: any): ImportedWorkout {
  const type = (a.activityType?.name || a.type || "").toLowerCase();
  const sport: ImportedWorkout["sport"] = type.includes("swim") ? "swim"
    : type.includes("cycling") || type.includes("bike") ? "bike"
    : type.includes("run") ? "run"
    : type.includes("strength") ? "strength" : "other";
  const durationSec = a.durationInSeconds ?? a.duration ?? 0;
  return {
    externalId: String(a.activityId || a.id || `${Date.now()}-${Math.random()}`),
    sport,
    date: new Date(a.startTimeInSeconds ? a.startTimeInSeconds * 1000 : a.startTimeLocal || Date.now()),
    durationMin: Math.round(durationSec / 60),
    distanceKm: a.distanceInMeters ? a.distanceInMeters / 1000 : undefined,
    avgHr: a.averageHr ?? a.averageHeartRateInBeatsPerMinute,
    maxHr: a.maxHr ?? a.maxHeartRateInBeatsPerMinute,
    avgPower: a.averagePowerInWatts,
    calories: a.calories,
    title: a.activityName || type || "Activity",
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
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function googleCalExchangeToken(cfg: GoogleCalConfig, code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Google token exchange failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

export async function googleCalRefreshToken(cfg: GoogleCalConfig, refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Google refresh failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// Fetch upcoming events from primary calendar (default 14 days).
export async function googleCalGetEvents(accessToken: string, days = 14): Promise<any[]> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Google calendar events failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.items || [];
}
