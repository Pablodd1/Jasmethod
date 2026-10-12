import type { CanonicalSession, CanonicalStep } from "./canonical-session";
import type { SessionNutrition } from "./session-nutrition";

export interface UniversalWorkoutCard {
  schemaVersion: "jmm-workout-card-v1";
  language: "en" | "es";
  session: CanonicalSession;
  nutrition: SessionNutrition;
  content: {
    summary: string;
    steps: string[];
    before: string[];
    during: string[];
    after: string[];
    preparation: string[];
    limitations: string[];
  };
  breathing: {
    beforeSeconds: 120;
    afterSeconds: 300;
    inhaleSeconds: 4;
    exhaleSeconds: 6;
    instructions: string;
    limitation: string;
  };
}

export function isUniversalWorkoutCard(v: unknown): v is UniversalWorkoutCard {
  const object = (x: unknown): x is Record<string, any> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  if (
    !object(v) ||
    v.schemaVersion !== "jmm-workout-card-v1" ||
    !["en", "es"].includes(v.language) ||
    !object(v.session) ||
    !object(v.content) ||
    !object(v.breathing)
  )
    return false;
  const s = v.session;
  if (
    ![
      "id",
      "athleteId",
      "title",
      "sport",
      "dateLocal",
      "timezone",
      "reason",
    ].every((k) => typeof s[k] === "string") ||
    !/^[a-f0-9]{64}$/.test(s.revision) ||
    !Number.isFinite(s.durationMin) ||
    s.durationMin < 0 ||
    s.durationMin > 1440 ||
    !["ready", "rest", "blocked"].includes(s.verdict) ||
    !Array.isArray(s.steps) ||
    s.steps.length > 1000
  )
    return false;
  if (
    !object(s.capability) ||
    typeof s.capability.available !== "boolean" ||
    typeof s.capability.reason !== "string" ||
    s.capability.deviceTested !== false
  )
    return false;
  if (
    !s.steps.every(
      (st: any) =>
        object(st) &&
        typeof st.name === "string" &&
        /^z[1-7]$/.test(st.zone) &&
        ["warmup", "active", "recovery", "cooldown"].includes(st.phase) &&
        Number.isFinite(st.seconds) &&
        st.seconds >= 0 &&
        object(st.endpoint) &&
        ["time", "distance", "reps", "lap"].includes(st.endpoint.type) &&
        object(st.target) &&
        typeof st.target.label === "string" &&
        ["explicit","profile_reference","effort"].includes(st.target.source) &&
        ["open","power","heartRate","pace","speed","swimStroke"].includes(st.target.type) &&
        (st.endpoint.type === "lap" || (Number.isFinite(st.endpoint[st.endpoint.type === "time" ? "seconds" : st.endpoint.type === "distance" ? "meters" : "reps"]) && st.endpoint[st.endpoint.type === "time" ? "seconds" : st.endpoint.type === "distance" ? "meters" : "reps"] > 0)) &&
        (!["power","heartRate","pace","speed"].includes(st.target.type) || (Number.isFinite(st.target.low) && Number.isFinite(st.target.high) && st.target.low >= 0 && st.target.high >= st.target.low)),
    )
  )
    return false;
  if (s.verdict !== "ready" && (s.steps.length || s.capability.available))
    return false;
  if (
    !["steps", "before", "during", "after", "preparation", "limitations"].every(
      (k) =>
        Array.isArray(v.content[k]) &&
        v.content[k].every((x: unknown) => typeof x === "string"),
    )
  )
    return false;
  if (
    typeof v.content.summary !== "string" ||
    v.content.steps.length !== s.steps.length
  )
    return false;
  if (
    typeof v.breathing.instructions !== "string" ||
    typeof v.breathing.limitation !== "string" ||
    v.breathing.beforeSeconds !== 120 ||
    v.breathing.afterSeconds !== 300 ||
    v.breathing.inhaleSeconds !== 4 ||
    v.breathing.exhaleSeconds !== 6
  )
    return false;
  if (
    s.exactTimeSeconds !== null &&
    (!Number.isFinite(s.exactTimeSeconds) ||
      s.steps.some(
        (st: any) =>
          st.endpoint.type !== "time" || st.endpoint.seconds !== st.seconds,
      ) ||
      Math.abs(
        s.steps.reduce((sum: number, st: any) => sum + st.seconds, 0) -
          s.exactTimeSeconds,
      ) > 0.001)
  )
    return false;
  return true;
}

export function stepColor(
  step: Pick<CanonicalStep, "phase" | "zone" | "group">,
): string {
  if (step.phase === "cooldown") return "#69bc86";
  if (step.phase === "warmup" || step.phase === "recovery") return "#6fb6d5";
  if (step.group === "Preparation" || step.group === "Strides")
    return "#f7c84a";
  return Number(step.zone.slice(1)) >= 4 ? "#ff5938" : Number(step.zone.slice(1)) <= 2 ? "#6fb6d5" : "#dcae48";
}
export function endpointText(step: CanonicalStep): string {
  const e = step.endpoint;
  return e.type === "time"
    ? e.seconds % 60 === 0
      ? `${e.seconds / 60} min`
      : `${e.seconds} s`
    : e.type === "distance"
      ? `${e.meters} m`
      : e.type === "reps"
        ? `${e.reps} reps`
        : "LAP";
}
export function targetUnit(
  type: CanonicalStep["target"]["type"],
): string | null {
  return (
    (
      { power: "W", heartRate: "bpm", pace: "s/km", speed: "m/s" } as Record<
        string,
        string
      >
    )[type] ?? null
  );
}
