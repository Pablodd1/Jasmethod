// OAuth structured FIT publication using documented bulk upsert and stable app-owned IDs.
// Provider acceptance does not establish downstream device receipt. Legacy ZWO is never published.
import { providerFetch } from "./provider-fetch";
import { requireIntervalsConnector } from "./capabilities";

const INTERVALS_API = "https://intervals.icu/api/v1";

export interface IntervalStep {
  name: string;
  seconds: number;
  zone: string; // z1..z7
  phase?: string;
  note?: string;
}

// Legacy-only ZWO conventions. Not canonical and never sent by launch network
// paths. A future structured provider implementation must use canonical targets.
const ZONE_FTP_PCT: Record<string, number> = {
  z1: 55, z2: 75, z3: 90, z4: 100, z5: 118, z6: 145, z7: 165,
};

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Build a TrainerRoad/Zwift-style ZWO from our prescription steps. Warmup /
// steady / interval / cooldown blocks with FTP% targets; recoveries at z1.
/** @deprecated Unvalidated legacy utility; do not publish its output. */
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

// Documented OAuth bulk upsert; FIT is generated from the exact canonical revision.
// Provider acceptance is not proof of downstream watch receipt.
export class IntervalsDeliveryError extends Error {
  constructor(message: string, public definite = false, public status = 502) { super(message); }
}
export async function intervalsUpsertFit(authorization: string, event: { external_id: string; start_date_local: string; filename: string; file_contents_base64: string }) {
  requireIntervalsConnector();
  const response = await providerFetch(`${INTERVALS_API}/athlete/0/events/bulk?upsert=true`, {
    method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify([{ category: "WORKOUT", ...event }]), redirect: "error",
  });
  if (!response.ok) throw new IntervalsDeliveryError("Intervals rejected or could not confirm the workout publication.", response.status >= 400 && response.status < 500 && response.status !== 408, response.status === 429 ? 429 : 502);
  let data: unknown;
  try { data = await response.json(); } catch { throw new IntervalsDeliveryError("Intervals returned an unreadable publication receipt."); }
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || !["string", "number"].includes(typeof data[0].id) || String(data[0].id).length === 0 ||
      (data[0].external_id != null && data[0].external_id !== event.external_id)) throw new IntervalsDeliveryError("Intervals did not return a matching publication receipt.");
  return { id: String(data[0].id) };
}
export async function intervalsDeleteOwnedEvent(authorization: string, externalId: string, legacyId?: string) {
  requireIntervalsConnector();
  const response = await providerFetch(`${INTERVALS_API}/athlete/0/events/bulk-delete`, {
    method: "PUT", headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify([legacyId ? { id: legacyId } : { external_id: externalId }]), redirect: "error",
  });
  if (!response.ok) throw new IntervalsDeliveryError("Intervals could not confirm cancellation.", response.status >= 400 && response.status < 500 && response.status !== 408);
  // The documented response is a count, including zero for an absent event.
  let count: unknown;
  try { count = await response.json(); } catch { throw new IntervalsDeliveryError("Intervals returned an unreadable cancellation receipt."); }
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) throw new IntervalsDeliveryError("Intervals did not confirm cancellation.");
  return { cancelled: true };
}
