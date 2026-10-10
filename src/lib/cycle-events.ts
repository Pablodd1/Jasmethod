import { addDaysKey } from "./dates";

export type CycleEventPriority = "A" | "B" | "C";
export interface CycleEvent {
  id: string;
  name: string;
  dateKey: string;
  priority: CycleEventPriority;
  distance?: string;
  source: "stored" | "request" | "profile" | "legacy";
}
export interface CycleEventInput {
  id?: string;
  name?: string;
  dateKey: string;
  priority?: CycleEventPriority | 1 | 2 | 3;
  distance?: string;
  source?: CycleEvent["source"];
}
export function validCycleDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function cycleDaysBetween(from: string, to: string) {
  if (!validCycleDateKey(from) || !validCycleDateKey(to)) throw new Error("Invalid cycle calendar date");
  return (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000;
}
/** Calendar-day inputs only: normalize stored UTC date-only race rows before calling.
 * Legacy scalar dates add protection, but never replace an existing event's priority. */
export function normalizeCycleEvents(options: { events?: readonly CycleEventInput[]; raceKey?: string | null }): CycleEvent[] {
  if (options.events != null && !Array.isArray(options.events)) throw new Error("Invalid cycle events");
  const byId = new Map<string, CycleEvent>();
  for (const [index, event] of (options.events ?? []).entries()) {
    if (!event || !validCycleDateKey(event.dateKey)) throw new Error("Invalid event calendar date");
    const priority = event.priority ?? "A";
    if (!["A", "B", "C", 1, 2, 3].includes(priority)) throw new Error("Invalid event priority");
    if (event.id != null && (typeof event.id !== "string" || !event.id.trim())) throw new Error("Invalid event id");
    if (event.name != null && typeof event.name !== "string") throw new Error("Invalid event name");
    if (event.distance != null && typeof event.distance !== "string") throw new Error("Invalid event distance");
    if (event.source != null && !["stored", "request", "profile", "legacy"].includes(event.source)) throw new Error("Invalid event source");
    const normalized: CycleEvent = {
      id: event.id ?? `event-${event.dateKey}-${index}`,
      name: event.name?.trim().slice(0, 160) || "Event",
      dateKey: event.dateKey,
      priority: typeof priority === "number" ? (["A", "B", "C"] as const)[priority - 1] : priority,
      ...(event.distance ? { distance: event.distance.trim().slice(0, 80) } : {}),
      source: event.source ?? "stored",
    };
    const existing = byId.get(normalized.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) throw new Error("Conflicting cycle event id");
    byId.set(normalized.id, normalized);
  }
  if (options.raceKey != null) {
    if (!validCycleDateKey(options.raceKey)) throw new Error("Invalid legacy event calendar date");
    if (![...byId.values()].some(event => event.dateKey === options.raceKey)) {
      const id = `legacy-${options.raceKey}`;
      if (byId.has(id)) throw new Error("Conflicting legacy event id");
      byId.set(id, { id, name: "Event", dateKey: options.raceKey, priority: "A", source: "legacy" });
    }
  }
  return [...byId.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id));
}

export const CYCLE_EVENT_POLICY_NOTE = "Conservative scheduling heuristics, not individualized taper or recovery prescriptions. A/B/C expresses importance, not physiological cost. All event dates are protected; preparation and recovery only reduce existing training. No peak or event result is promised. Actual effort, symptoms and recovery can require more rest and qualified review.";
/** Duration/cost is often unknown; a C label never implies a low-cost race. */
export function cycleEventPolicy(event: CycleEvent) {
  const long = ["full", "marathon", "ironman", "ultra"].includes(event.distance?.toLowerCase() ?? "");
  const middle = ["half", "half-marathon", "70.3"].includes(event.distance?.toLowerCase() ?? "");
  return {
    preparationDays: event.priority === "A" ? 14 : event.priority === "B" ? 7 : 3,
    recoveryDays: long ? 14 : middle ? 10 : 7,
  };
}
export interface CycleEventWarning {
  code: "close_events" | "short_preparation" | "recent_event";
  eventIds: string[];
  message: string;
}
export function assessCycleEvents(events: readonly CycleEvent[], startKey: string, weeks: number) {
  if (!validCycleDateKey(startKey) || !Number.isInteger(weeks) || weeks < 1 || weeks > 52) throw new Error("Invalid event review horizon");
  const endKey = addDaysKey(startKey, weeks * 7 - 1);
  const relevant = events.filter(event => {
    const policy = cycleEventPolicy(event);
    return addDaysKey(event.dateKey, policy.recoveryDays) >= startKey && addDaysKey(event.dateKey, -policy.preparationDays) <= endKey;
  }).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.id.localeCompare(b.id));
  const warnings: CycleEventWarning[] = [];
  for (const event of relevant) {
    const days = cycleDaysBetween(startKey, event.dateKey);
    if (days < 0) warnings.push({ code: "recent_event", eventIds: [event.id], message: `${event.name} (${event.dateKey}) falls before the cycle; its provisional recovery window still applies. Review actual recovery before resuming.` });
    else if (days < 28) warnings.push({ code: "short_preparation", eventIds: [event.id], message: `${event.name} (${event.dateKey}, ${event.priority}) is less than four weeks from the start. Choose conservative preparation or obtain a coach-reviewed plan; this cycle cannot promise readiness or a peak.` });
  }
  for (let first = 0; first < relevant.length; first++) for (let second = first + 1; second < relevant.length; second++) {
    const a = relevant[first], b = relevant[second];
    if (addDaysKey(a.dateKey, cycleEventPolicy(a).recoveryDays) < addDaysKey(b.dateKey, -cycleEventPolicy(b).preparationDays)) continue;
    warnings.push({ code: "close_events", eventIds: [a.id, b.id], message: `${a.name} (${a.dateKey}, ${a.priority}) and ${b.name} (${b.dateKey}, ${b.priority}) have overlapping preparation/recovery windows. Review priorities and choose conservative reduced training, change the event choices, or seek coaching review. Separate peaks are not assumed.` });
  }
  return { events: relevant, warnings, requiresChoice: warnings.length > 0, policyNote: CYCLE_EVENT_POLICY_NOTE };
}
export function cycleEventDay(events: readonly CycleEvent[], key: string) {
  let factor = 1;
  let phase: "ordinary" | "preparation" | "recovery" | "event" = "ordinary";
  const eventIds: string[] = [];
  for (const event of events) {
    const gap = cycleDaysBetween(key, event.dateKey);
    const policy = cycleEventPolicy(event);
    if (gap === 0) { factor = 0; phase = "event"; eventIds.push(event.id); continue; }
    if (gap < 0 && -gap <= policy.recoveryDays) {
      factor = Math.min(factor, .5); if (phase !== "event") phase = "recovery"; eventIds.push(event.id);
    } else if (gap > 0 && gap <= policy.preparationDays) {
      factor = Math.min(factor, event.priority === "A" ? (gap <= 7 ? .5 : .65) : event.priority === "B" ? .65 : .75);
      if (phase === "ordinary") phase = "preparation";
      eventIds.push(event.id);
    }
  }
  return { factor, phase, eventIds, protected: phase === "event" };
}
