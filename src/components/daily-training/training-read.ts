/** Bounded, cancellable reads for training screens. Never retries a mutation. */
export class TrainingReadError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "TrainingReadError"; }
}

export async function readTrainingJson<T>(url: string, options: {
  signal: AbortSignal;
  label: string;
  validate: (value: unknown) => value is T;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  emptyValue?: T;
}): Promise<T> {
  if (options.signal.aborted) throw new DOMException("Training view closed", "AbortError");
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => { reject(new DOMException("Training view closed", "AbortError")); controller.abort(); };
    options.signal.addEventListener("abort", cancel, { once: true });
    timeout = setTimeout(() => {
      reject(new TrainingReadError(`${options.label} took too long to load. Please retry.`));
      controller.abort();
    }, options.timeoutMs ?? 15000);
  });
  try {
    return await Promise.race([
      (async () => {
        let response: Response;
        try { response = await (options.fetcher ?? fetch)(url, { cache: "no-store", signal: controller.signal }); }
        catch (error) {
          if (controller.signal.aborted) throw error;
          throw new TrainingReadError(`${options.label} could not be reached. Check your connection and retry.`);
        }
        if (!response.ok) throw new TrainingReadError(response.status === 401
          ? "Sign in again to load your training."
          : response.status === 403 ? "Your training access could not be verified. Please sign in again."
          : `Could not load ${options.label.toLowerCase()}. Please retry.`, response.status);
        if (response.status === 204 && "emptyValue" in options) return options.emptyValue as T;
        let value: unknown;
        try { value = await response.json(); }
        catch { throw new TrainingReadError(`${options.label} returned an unreadable response. Please retry.`); }
        if (!options.validate(value)) throw new TrainingReadError(`${options.label} could not be verified. Please retry.`);
        return value;
      })(),
      cancelled,
    ]);
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", cancel);
  }
}

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optionalText = (value: unknown) => value == null || text(value);
const textFields = (value: Record<string, any>, fields: string[]) => fields.every(field => optionalText(value[field]));
const optionalObject = (value: unknown, valid: (item: Record<string, any>) => boolean) => value == null || (object(value) && valid(value));
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value));
const records = (value: unknown, valid: (item: Record<string, any>) => boolean) => Array.isArray(value) && value.every(item => object(item) && valid(item));
const optionalRecords = (value: unknown, valid: (item: Record<string, any>) => boolean) => value == null || records(value, valid);
const sessionSummary = (session: Record<string, any>) => text(session.id) && text(session.title) && text(session.sport) &&
  finite(session.durationMin) && session.durationMin >= 0 && textFields(session, ["intensity", "startTime", "feedbackStatus", "revision"]);
const cycleMetadata = (value: unknown) => value == null || (object(value) && object(value.baseline) && object(value.activity) &&
  optionalRecords(value.weeks, week => finite(week.week) && text(week.theme) && finite(week.totalMinutes)) &&
  (value.events == null || (object(value.events) && optionalRecords(value.events.events, event => text(event.dateKey) && optionalText(event.name) && optionalText(event.priority)))) &&
  optionalRecords(value.baselineReviews, review => text(review.sport)) && optionalRecords(value.baselineEvidence, reference => text(reference.label)));

export const isSavedPlanResponse = (value: unknown): value is { plans: any[]; cycle?: any } =>
  object(value) && records(value.plans, plan => text(plan.id) && text(plan.name) && date(plan.startDate) &&
    finite(plan.weeks) && plan.weeks > 0 && (plan.raceDate == null || date(plan.raceDate)) &&
    records(plan.days, day => text(day.id) && date(day.date) && records(day.sessions, sessionSummary))) && cycleMetadata(value.cycle);

export const isTrainingProfileResponse = (value: unknown): value is { profile: any; zones: any; setup: any; planningReadiness: any } =>
  object(value) && "profile" in value && (value.profile === null || object(value.profile)) &&
    "zones" in value && (value.zones === null || (object(value.zones) && (value.zones.hr == null || object(value.zones.hr)))) &&
    object(value.planningReadiness) && typeof value.planningReadiness.ready === "boolean" &&
    ["missing", "review"].every(key => Array.isArray(value.planningReadiness[key]) && value.planningReadiness[key].every(text));

function todaySession(session: Record<string, any>) {
  const p = session.prescription;
  return sessionSummary(session) && textFields(session, ["resolutionReason", "coachNotes"]) && object(p) && object(p.targets) && text(p.verdict) &&
    optionalObject(p.detail, detail => textFields(detail, ["breathing"])) && optionalObject(p.scaled, scaled => textFields(scaled, ["reason"])) &&
    records(p.steps, step => text(step.name) && text(step.zone) && textFields(step, ["note", "group", "phase"]) && finite(step.seconds) && step.seconds >= 0 &&
      (step.target == null || (object(step.target) && text(step.target.label) && optionalText(step.target.missingReason))) &&
      (step.endpoint == null || (object(step.endpoint) && ["time", "distance", "reps", "lap"].includes(step.endpoint.type)))) &&
    (session.capability == null || (object(session.capability) && typeof session.capability.available === "boolean" && text(session.capability.reason))) &&
    optionalObject(session.jStress, stress => (stress.value == null || finite(stress.value)) && optionalText(stress.reason)) &&
    optionalObject(session.post, post => textFields(post, ["note", "examples", "ratio"])) &&
    (session.fuel == null || (object(session.fuel) && textFields(session.fuel, ["gutNote"]) &&
      optionalObject(session.fuel.preSession, pre => textFields(pre, ["note", "timingLabel"])) && optionalRecords(session.fuel.segments, segment =>
      finite(segment.atMin) && finite(segment.carbsG) && finite(segment.fluidMl) && finite(segment.sodiumMg) && text(segment.label)))) &&
    optionalRecords(session.fuelCurve, point => finite(point.hours) && finite(point.gPerHour) && text(point.label));
}

export const isTodayTrainingResponse = (value: unknown): value is Record<string, any> =>
  object(value) && date(value.date) && text(value.timezone) && records(value.sessions, todaySession) &&
    optionalObject(value.athleteReview, review => finite(review.rawRecordCount) && (finite(review.possibleCopies) || (review.possibleCopies === null && object(review.derivedActivityPolicy) && review.derivedActivityPolicy.status === "insufficient" && text(review.derivedActivityPolicy.reason))) && (review.baselineWeeklyMinutes == null || finite(review.baselineWeeklyMinutes)) && optionalText(review.baselineObservedAt) && records(review.records, row => text(row.id) && text(row.title) && text(row.sport) && text(row.source) && ['minutes','rpe','distanceKm','paceSecondsPerKm','avgHr','avgPower','calories','preWeightKg','postWeightKg'].every(key => row[key] == null || finite(row[key])) && textFields(row,['actualDetails','feedbackStatus','feedbackNote','matchedPlanId']))) &&
    optionalObject(value.race, race => optionalText(race.name) && finite(race.daysAway)) &&
    optionalObject(value.cycle, cycle => textFields(cycle, ["start", "end", "status"]) && finite(cycle.weeks) && (cycle.currentWeek == null || finite(cycle.currentWeek))) &&
    optionalObject(value.motivation, motivation => textFields(motivation, ["quote", "message", "source"])) &&
    records(value.connectors, connector => text(connector.provider) && text(connector.status) && optionalText(connector.lastError)) &&
    optionalRecords(value.activityReports, report => text(report.id) && text(report.title) && text(report.headline) && text(report.body) && date(report.date));
