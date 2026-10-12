import { normalizeSteps, type SessionSport } from "./canonical-session";
import { ApiError } from "./access";

export function parseWorkoutCardEdit(value: unknown, sport: SessionSport) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError("Send a workout edit.");
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (k) => !["id", "expectedRevision", "steps"].includes(k),
    )
  )
    throw new ApiError("Only structured steps may be edited here.");
  if (
    typeof body.id !== "string" ||
    !body.id ||
    body.id.length > 200 ||
    typeof body.expectedRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.expectedRevision)
  )
    throw new ApiError("Reload the workout before editing.", 409);
  if (!["run", "bike"].includes(sport))
    throw new ApiError(
      "Use the explicit sport structure editor for this sport.",
      422,
    );
  if (
    !Array.isArray(body.steps) ||
    !body.steps.length ||
    body.steps.length > 50
  )
    throw new ApiError("Use 1–50 explicit steps.");
  if (
    body.steps.some(
      (step: any) =>
        !step || typeof step !== "object" || step.repeat !== undefined,
    )
  )
    throw new ApiError("Supply each repetition as an explicit ordered step.");
  const steps = normalizeSteps(body.steps, sport);
  if (steps.length > 50)
    throw new ApiError("Expanded workout exceeds 50 steps.");
  if (steps.some((s) => s.endpoint.type !== "time"))
    throw new ApiError(
      "This editor supports exact timed steps. Use the sport structure editor for other endpoints.",
    );
  const seconds = steps.reduce((sum, s) => sum + s.seconds, 0);
  if (seconds > 86400) throw new ApiError("Workout exceeds one day.");
  return {
    id: body.id,
    expectedRevision: body.expectedRevision,
    seconds,
    steps: steps.map((s, index) => ({
      name: s.name,
      phase: s.phase,
      zone: s.zone,
      seconds: s.seconds,
      endpoint: s.endpoint,
      ...(s.group ? { group: s.group } : {}),
      ...(s.note ? { note: s.note } : {}),
      ...((body.steps as any[])[index].target === undefined
        ? {}
        : {
            target:
              s.target.type === "open"
                ? { type: "open" }
                : {
                    type: s.target.type,
                    low: s.target.low,
                    high: s.target.high,
                  },
          }),
    })),
  };
}
