/**
 * COROS direct boundary. These drafts are JMM data, NOT the provider's course JSON.
 * The authenticated tools/list schema and saved-result contract must be captured
 * and tested before a wire encoder or write path can be enabled.
 */
import type { CanonicalSession, CanonicalStep, ResolvedTarget, StepEndpoint } from "./canonical-session";

export class CorosDirectError extends Error {
  constructor(message: string, public readonly code: "unsupported" | "invalid_session" | "write_disabled" | "invalid_operation", public readonly status = 422) {
    super(message);
    this.name = "CorosDirectError";
  }
}

export const COROS_DIRECT_BLOCKER = "Direct COROS delivery is not enabled: an authorized account connection, verified live workout schemas, and saved-result validation are still required.";

export function corosDirectAvailability() {
  return {
    available: false as const,
    status: "implementation_pending" as const,
    reason: COROS_DIRECT_BLOCKER,
    oauthSupported: true as const,
    partnerApplicationRequired: false as const,
    wireSchemaVerified: false as const,
    deviceTested: false as const,
    cancellationSupported: false as const,
    moveSupported: false as const,
    inboundMode: "polling" as const,
    inboundNormalizationVerified: false as const,
  };
}

export interface CorosWorkoutDraft {
  format: "jmm-coros-draft-v1";
  wireSchemaVerified: false;
  athleteId: string;
  sessionId: string;
  revision: string;
  title: string;
  sport: "run" | "bike";
  /** Official training-course codes; different from activity sport codes. */
  courseSportCode: 1 | 2;
  dateLocal: string;
  timezone: string;
  /** The canonical boundary has already expanded repeats; no step is collapsed. */
  repeatRepresentation: "expanded_exact";
  steps: Array<{
    order: number;
    name: string;
    phase: CanonicalStep["phase"];
    zone: string;
    endpoint: StepEndpoint;
    target: ResolvedTarget;
    note?: string;
    group?: string;
  }>;
}

function invalid(message: string): never { throw new CorosDirectError(message, "invalid_session"); }
function positive(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) invalid(`Missing ${label}.`);
}
function calendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
function providerId(value: unknown): value is string { return typeof value === "string" && value.length <= 128 && /^[1-9]\d*$/.test(value); }
function endpoint(step: CanonicalStep): StepEndpoint {
  const ep = step.endpoint;
  if (ep?.type === "time" && positive(ep.seconds)) return { type: "time", seconds: ep.seconds };
  if (ep?.type === "distance" && positive(ep.meters)) return { type: "distance", meters: ep.meters };
  if (ep?.type === "lap") return { type: "lap" };
  if (ep?.type === "reps") throw new CorosDirectError("Repetition endpoints cannot be encoded as COROS run/bike steps.", "unsupported");
  return invalid("Invalid canonical step endpoint.");
}
function target(step: CanonicalStep): ResolvedTarget {
  const value = step.target;
  if (!value || !["explicit", "profile_reference", "effort"].includes(value.source)) invalid("Invalid target source.");
  if (value.stroke !== undefined) throw new CorosDirectError("Stroke targets are unsupported for COROS run/bike preparation.", "unsupported");
  text(value.label, "target label");
  if (value.type === "open") {
    if (value.low !== undefined || value.high !== undefined) invalid("Open targets cannot carry numeric bounds.");
  } else {
    if (!["power", "heartRate", "pace", "speed"].includes(value.type)) throw new CorosDirectError("This target is unsupported for COROS run/bike preparation.", "unsupported");
    if (typeof value.low !== "number" || !Number.isFinite(value.low) || value.low < (value.type === "power" ? 0 : Number.MIN_VALUE) || !positive(value.high) || value.low > value.high) invalid("Invalid canonical target bounds.");
    if (["power", "heartRate"].includes(value.type) && (!Number.isInteger(value.low) || !Number.isInteger(value.high))) invalid("Power and heart-rate targets require whole units.");
  }
  // Canonical units stay unchanged: seconds/km, m/s, watts, bpm. No zone or
  // threshold conversion is guessed from COROS's undocumented nested fields.
  return { ...value };
}

export function canonicalCorosWorkout(session: CanonicalSession): CorosWorkoutDraft {
  if (session.schemaVersion !== 2) invalid("Unsupported canonical session schema.");
  if (session.verdict !== "ready") invalid(session.reason || "Only ready canonical sessions can be prepared for COROS.");
  if (session.sport !== "run" && session.sport !== "bike") throw new CorosDirectError("Direct COROS preparation supports run and bike sessions only.", "unsupported");
  if (session.components?.length || session.sportStructure) throw new CorosDirectError("Structured multisport content requires a verified COROS mapping.", "unsupported");
  for (const [value, label] of [[session.athleteId, "athlete"], [session.id, "session"], [session.revision, "revision"], [session.title, "title"], [session.timezone, "timezone"]]) text(value, label);
  if (!calendarDate(session.dateLocal)) invalid("Invalid session local date.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: session.timezone }); } catch { invalid("Invalid session timezone."); }
  if (!session.steps?.length || session.steps.length > 1000) invalid("Canonical step count is outside the preparation safety limit.");
  return {
    format: "jmm-coros-draft-v1", wireSchemaVerified: false,
    athleteId: session.athleteId, sessionId: session.id, revision: session.revision,
    title: session.title, sport: session.sport, courseSportCode: session.sport === "run" ? 1 : 2,
    dateLocal: session.dateLocal, timezone: session.timezone, repeatRepresentation: "expanded_exact",
    steps: session.steps.map((step, order) => {
      text(step.name, "step name");
      if (!["warmup", "active", "recovery", "cooldown"].includes(step.phase) || !/^z[1-7]$/.test(step.zone)) invalid("Invalid canonical step phase or zone.");
      if (step.componentId || step.componentSport || step.sportDetail) throw new CorosDirectError("Sport-specific step details require a verified COROS mapping.", "unsupported");
      for (const key of ["note", "group"] as const) if (step[key] !== undefined && typeof step[key] !== "string") invalid(`Invalid step ${key}.`);
      return {
        order, name: step.name, phase: step.phase, zone: step.zone, endpoint: endpoint(step), target: target(step),
        ...(step.note !== undefined ? { note: step.note } : {}), ...(step.group !== undefined ? { group: step.group } : {}),
      };
    }),
  };
}

export type CorosOperation =
  | { action: "create_library" | "create_scheduled" }
  | { action: "update_library"; libraryId: string; editable: boolean }
  | { action: "schedule_library"; libraryId: string }
  | { action: "update_scheduled"; idInPlan: string; dateLocal: string; editable: boolean; recordRole: "standalone" | "plan" }
  | { action: "cancel" | "move" };

/** A routing/preflight result, not arguments suitable for tools/call. */
export function planCorosOperation(session: CanonicalSession, operation: CorosOperation) {
  if (operation.action === "cancel" || operation.action === "move") throw new CorosDirectError("Move or remove the scheduled workout in the COROS App. Creating a replacement would leave the old workout in place.", "unsupported");
  const draft = canonicalCorosWorkout(session);
  if ("libraryId" in operation && !providerId(operation.libraryId)) throw new CorosDirectError("Use the full library identifier returned by COROS.", "invalid_operation");
  if ("editable" in operation && operation.editable !== true) throw new CorosDirectError("COROS marks this workout as non-editable.", "invalid_operation");
  if (operation.action === "update_scheduled") {
    if (operation.recordRole !== "standalone") throw new CorosDirectError("Plan workouts must be edited through their execution plan, not standalone workout tools.", "unsupported");
    if (!providerId(operation.idInPlan)) throw new CorosDirectError("Use the full scheduled-copy identifier returned by COROS.", "invalid_operation");
    if (operation.dateLocal !== session.dateLocal) throw new CorosDirectError("COROS cannot move a standalone scheduled workout. Change its date in the COROS App first.", "unsupported");
  }
  const routes = {
    create_library: { tool: "createSingleWorkout", readFirst: [], destination: "library" },
    create_scheduled: { tool: "createScheduledWorkout", readFirst: ["queryTrainingSchedule"], destination: "scheduled" },
    update_library: { tool: "updateWorkoutDetails", readFirst: ["queryWorkoutDetails"], destination: "library" },
    schedule_library: { tool: "scheduleWorkout", readFirst: ["queryWorkoutDetails", "queryTrainingSchedule"], destination: "scheduled" },
    update_scheduled: { tool: "updateScheduledWorkout", readFirst: ["queryTrainingSchedule", "queryScheduledWorkoutDetails"], destination: "scheduled" },
  } as const;
  const route = routes[operation.action as keyof typeof routes];
  if (!Object.prototype.hasOwnProperty.call(routes, operation.action) || !route) throw new CorosDirectError("Unknown COROS operation.", "invalid_operation");
  return {
    status: "blocked" as const, reason: COROS_DIRECT_BLOCKER, draft, ...route,
    libraryCopiesIndependent: true as const,
    preserveReturnedIdInPlan: operation.action === "update_scheduled",
    requiresLiveSchema: true as const, requiresReadBack: true as const, deviceReceived: false as const,
  };
}

/** No hidden environment flag can enable an unverified write protocol. */
export async function publishCanonicalCorosWorkout(_session: CanonicalSession, _operation: CorosOperation = { action: "create_scheduled" }): Promise<never> {
  throw new CorosDirectError(COROS_DIRECT_BLOCKER, "write_disabled", 503);
}
