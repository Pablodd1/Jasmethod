// Intervals.icu connector — the verified open bridge for structured-workout
// delivery (owner request 2026-09-28, docs verified against the official
// forum API guide + api-docs.html):
//   POST https://intervals.icu/api/v1/athlete/0/events
//   Basic auth: "API_KEY" : <key>   (athlete generates the key in
//   Intervals.icu → Settings → Developer Settings)
//   Payload: { category: "WORKOUT", start_date_local (MUST end T00:00:00),
//              type, name, description, icu_training_load, filename,
//              file_contents (ZWO for structured bike sessions) }
// Intervals then syncs the workout to the athlete's linked Garmin/COROS/
// Wahoo/Suunto account automatically. Honest scope: bike sessions get FULL
// structure (ZWO); run/swim/other get a named calendar event with the step
// list in the description + planned load — their API's structured-run
// format is not documented, and we don't guess.
import { providerFetch } from "./provider-fetch";

const INTERVALS_API = "https://intervals.icu/api/v1";

export interface IntervalStep {
  name: string;
  seconds: number;
  zone: string; // z1..z7
  phase?: string;
  note?: string;
}

// Zone → % of FTP for the bike ZWO power targets (matches our zoneTargets
// multipliers — coaching conventions, labeled as plan targets).
const ZONE_FTP_PCT: Record<string, number> = {
  z1: 55, z2: 75, z3: 90, z4: 100, z5: 118, z6: 145, z7: 165,
};

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build a TrainerRoad/Zwift-style ZWO from our prescription steps. Warmup /
// steady / interval / cooldown blocks with FTP% targets; recoveries at z1.
export function buildZwo(title: string, steps: IntervalStep[]): string {
  const blocks = steps
    .map((s) => {
      // FORMAT FACTS (ZWO spec, verified): Power is a FRACTION of FTP
      // (0.55 = 55%) — integer percents parse as 100× FTP (Codex P1-2).
      // Warmup/Cooldown take PowerLow+PowerHigh ramps; recovery is a plain
      // SteadyState (IntervalsT is a repeat element with its own attrs).
      // Durations are exact seconds — no clamping.
      const frac = ((ZONE_FTP_PCT[(s.zone || "z2").toLowerCase()] ?? 75) / 100).toFixed(2);
      const dur = Math.max(1, Math.round(s.seconds));
      const note = s.note ? ` text="${xmlEscape(s.note.slice(0, 120))}"` : "";
      if (s.phase === "warmup")
        return `      <Warmup PowerLow="${Math.max(0.3, +frac - 0.15).toFixed(2)}" PowerHigh="${frac}" Duration="${dur}"${note}/>`;
      if (s.phase === "cooldown")
        return `      <Cooldown PowerLow="${frac}" PowerHigh="0.4" Duration="${dur}"${note}/>`;
      return `      <SteadyState Power="${frac}" Duration="${dur}"${note}/>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <name>${xmlEscape(title)}</name>
  <description>Created by JasMiamiMethod KCoach</description>
  <workout>
${blocks}
  </workout>
</workout_file>
`;
}

export interface IntervalsEvent {
  dateLocal: string; // YYYY-MM-DD
  sport: string; // run | bike | swim | strength | ...
  title: string;
  description: string;
  trainingLoad?: number; // planned TSS
  steps?: IntervalStep[];
}

// Create the calendar event. Returns the Intervals event id (saved by the
// caller for later updates/deletes).
export async function intervalsCreateEvent(
  apiKey: string,
  ev: IntervalsEvent,
): Promise<{ id: string }> {
  const structured = ev.sport === "bike" && ev.steps?.length;
  const body: Record<string, unknown> = {
    category: "WORKOUT",
    // Their API requires local dates WITHOUT time — must end T00:00:00.
    start_date_local: `${ev.dateLocal}T00:00:00`,
    type:
      ev.sport === "bike" ? "Ride" : ev.sport === "run" ? "Run" : ev.sport === "swim" ? "Swim" : "Other",
    name: ev.title.slice(0, 80),
    description: ev.description.slice(0, 1000),
    ...(ev.trainingLoad ? { icu_training_load: Math.round(ev.trainingLoad) } : {}),
    ...(structured
      ? {
          filename: "jmm-workout.zwo",
          file_contents: buildZwo(ev.title, ev.steps!),
        }
      : {}),
  };
  const resp = await providerFetch(`${INTERVALS_API}/athlete/0/events`, {
    method: "POST",
    headers: {
      // API key as basic-auth password, literal "API_KEY" as the username
      // (their documented convention). Browser-like UA avoids Cloudflare
      // blocks on scripted clients.
      Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
      "User-Agent": "JasMiamiMethod/1.0 (https://jasmiamimethod.fit)",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok)
    throw new Error(
      `Intervals.icu push failed: ${resp.status} ${(await resp.text().catch(() => "")).slice(0, 140)}`,
    );
  const created = await resp.json();
  return { id: String(created.id ?? created.event_id ?? "") };
}

// Update an existing calendar event (PUT) — the re-push path; keeps edits
// and plan changes from stacking duplicates on the athlete's calendar.
export async function intervalsUpdateEvent(
  apiKey: string,
  eventId: string,
  ev: IntervalsEvent,
): Promise<void> {
  const structured = ev.sport === "bike" && ev.steps?.length;
  const body: Record<string, unknown> = {
    category: "WORKOUT",
    start_date_local: `${ev.dateLocal}T00:00:00`,
    type:
      ev.sport === "bike" ? "Ride" : ev.sport === "run" ? "Run" : ev.sport === "swim" ? "Swim" : "Other",
    name: ev.title.slice(0, 80),
    description: ev.description.slice(0, 1000),
    ...(ev.trainingLoad ? { icu_training_load: Math.round(ev.trainingLoad) } : {}),
    ...(structured ? { filename: "jmm-workout.zwo", file_contents: buildZwo(ev.title, ev.steps!) } : {}),
  };
  const resp = await providerFetch(`${INTERVALS_API}/athlete/0/events/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
      "User-Agent": "JasMiamiMethod/1.0 (https://jasmiamimethod.fit)",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok)
    throw new Error(`Intervals.icu update failed: ${resp.status}`);
}

// Key check for the connect flow — reads the key's own athlete profile.
export async function intervalsVerifyKey(
  apiKey: string,
): Promise<{ ok: boolean; athlete?: string; error?: string }> {
  try {
    const resp = await providerFetch(`${INTERVALS_API}/athlete/0`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
        "User-Agent": "JasMiamiMethod/1.0 (https://jasmiamimethod.fit)",
      },
    });
    if (!resp.ok) return { ok: false, error: `Intervals.icu rejected the key (${resp.status})` };
    const a = await resp.json();
    return { ok: true, athlete: String(a.name || a.id || "athlete") };
  } catch (e) {
    return { ok: false, error: String((e as Error).message).slice(0, 120) };
  }
}
