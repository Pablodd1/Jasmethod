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
/** The offline view cannot submit results, so personal feedback notes stay in
 * the authenticated response rather than persistent browser storage. */
export function todayOfflineSnapshot(value: Record<string, any>) {
  return {
    ...value,
    sessions: value.sessions.map((session: Record<string, any>) => ({ ...session, feedbackNote: null, preWorkoutWeight: null })),
    ...(value.athleteReview ? { athleteReview: { ...value.athleteReview, records: value.athleteReview.records.map((record: Record<string, any>) => ({ ...record, feedbackNote: null })) } } : {}),
  };
}
const sessionSummary = (session: Record<string, any>) => text(session.id) && text(session.title) && text(session.sport) &&
  finite(session.durationMin) && session.durationMin >= 0 && textFields(session, ["intensity", "startTime", "feedbackStatus", "feedbackNote", "revision"]);
const cycleMetadata = (value: unknown) => object(value) && textFields(value, ["goal", "assessment", "evidenceNote"]) &&
  object(value.baseline) && finite(value.baseline.weeklyMinutes) && value.baseline.weeklyMinutes > 0 &&
  ["athlete_reported", "coach_set"].includes(value.baseline.source) && date(value.baseline.observedAt) &&
  object(value.activity) && ["reportedSessions", "reportedMinutes", "unknownDurationSessions"].every(key => value.activity[key] == null || finite(value.activity[key])) && optionalText(value.activity.note) &&
  optionalRecords(value.weeks, week => finite(week.week) && text(week.theme) && finite(week.totalMinutes) &&
    optionalObject(week.volumeDecision, decision => ["scheduledMinutes", "cycleFactor"].every(key => finite(decision[key])))) &&
  (value.events == null || (object(value.events) && optionalRecords(value.events.events, event => text(event.dateKey) && optionalText(event.name) && optionalText(event.priority)))) &&
  optionalRecords(value.baselineReviews, review => text(review.sport) && textFields(review, ["observedAt", "reviewDueAt", "expiresAt"])) &&
  optionalRecords(value.baselineEvidence, reference => text(reference.label) && optionalText(reference.source));

/** Audit summaries are optional presentation, not the saved schedule or a
 * prescription. A legacy/malformed summary must never hide valid plan days. */
export const readSavedCycleMetadata = (value: unknown) => cycleMetadata(value) ? value as Record<string, any> : null;

export const isSavedPlanResponse = (value: unknown): value is { plans: any[]; cycle?: any; cycleSummaryNeedsReview?: boolean } =>
  object(value) && (value.cycleSummaryNeedsReview == null || typeof value.cycleSummaryNeedsReview === "boolean") && records(value.plans, plan => text(plan.id) && text(plan.name) && date(plan.startDate) &&
    finite(plan.weeks) && plan.weeks > 0 && (plan.raceDate == null || date(plan.raceDate)) &&
    records(plan.days, day => text(day.id) && date(day.date) && records(day.sessions, sessionSummary)));

const slots = (value: unknown) => Array.isArray(value) && value.every(slot => Number.isInteger(slot) && slot >= 0 && slot <= 6);
const plannedStep = (step: Record<string, any>) => text(step.name) && text(step.zone) && finite(step.seconds) && step.seconds >= 0 &&
  textFields(step, ["note", "group", "phase"]) && (step.reps == null || finite(step.reps));
const referenceDate = (value: unknown) => text(value) && date(value) && /^\d{4}-\d{2}-\d{2}(?:T.+Z)?$/.test(value) && new Date(value).toISOString().slice(0,10) === value.slice(0,10);
const projectedReference = (reference: Record<string, any>) => ["athlete_reported_reference", "applied_field_test", "estimated_from_applied_5k"].includes(reference.source) &&
  referenceDate(reference.observedAt) && ["W", "sec/km", "sec/100m"].includes(reference.unit) && finite(reference.value) && reference.value > 0 && reference.value <= (reference.unit === "W" ? 1000 : 3600);
const targetProjection = (value: unknown, steps: any[]) => value == null || object(value) &&
  records(value.steps, step => text(step.targetLabel) && step.targetLabel.length > 0 && (step.speedLabel === null || text(step.speedLabel) && step.speedLabel.length > 0) &&
    (step.reference === null || object(step.reference) && projectedReference(step.reference))) && value.steps.length === steps.length &&
  (value.mechanicalWork === null || object(value.mechanicalWork) && finite(value.mechanicalWork.lowKj) && finite(value.mechanicalWork.highKj) &&
    value.mechanicalWork.lowKj >= 0 && value.mechanicalWork.highKj > 0 && value.mechanicalWork.lowKj <= value.mechanicalWork.highKj);
/** Only reviewed structured previews can reach the confirmation controls. */
export function isPlanPreviewResponse(value: unknown): value is Record<string, any> {
  if (!object(value) || value.ok !== true || !text(value.previewToken) || !/^[a-f0-9]{64}$/.test(value.previewToken) ||
      !object(value.preview) || !text(value.warning) || typeof value.doubleDayAgreementRequired !== "boolean" || typeof value.eventTradeoffAgreementRequired !== "boolean") return false;
  const p = value.preview;
  return text(p.distance) && Number.isInteger(p.weeks) && p.weeks >= 4 && p.weeks <= 30 && date(p.startDate) &&
    (p.raceDate == null || date(p.raceDate)) && finite(p.weeklyBudgetMin) && p.weeklyBudgetMin > 0 && Number.isInteger(p.existingPlans) && p.existingPlans >= 0 &&
    records(p.weeksPreview, week => Number.isInteger(week.week) && text(week.theme) && finite(week.totalMinutes) && week.totalMinutes >= 0 && slots(week.restDaySlots) &&
      (week.eventDays == null || Array.isArray(week.eventDays) && week.eventDays.every(date)) &&
      optionalObject(week.volumeDecision, decision => ["scheduledMinutes", "cycleFactor", "remainingPlannedMinutes"].every(key => finite(decision[key])) && text(decision.reason)) &&
      records(week.sessions, session => text(session.title) && text(session.sport) && text(session.zone) && finite(session.minutes) && session.minutes > 0 && Number.isInteger(session.daySlot) && session.daySlot >= 0 && session.daySlot <= 6 &&
        textFields(session, ["description", "startTime"]) && records(session.steps, plannedStep) && session.steps.length > 0 && targetProjection(session.targetPreview,session.steps))) && p.weeksPreview.length === p.weeks &&
    p.weeksPreview.some((week: Record<string, any>) => week.sessions.length > 0) &&
    optionalObject(p.recoveryPolicy, policy => finite(policy.minimumRestDays) && policy.minimumRestDays >= 0) &&
    (p.cycle == null || cycleMetadata(p.cycle) && Array.isArray(p.cycle.weeks) &&
      (p.cycle.events?.warnings == null || records(p.cycle.events.warnings, warning => text(warning.code) && text(warning.message) && Array.isArray(warning.eventIds) && warning.eventIds.every(text))));
}

/** A 2xx alone is not evidence that a plan was saved. */
export const isGeneratedPlanResponse = (value: unknown): value is Record<string, any> => object(value) && value.ok === true &&
  object(value.plan) && text(value.plan.id) && value.plan.id.length > 0 && text(value.plan.name) &&
  records(value.plan.sessions, session => text(session.id) && text(session.userId) && text(session.title) && text(session.sport) && finite(session.durationMin) && session.durationMin > 0) && value.plan.sessions.length > 0;

const heartRateTable = (value: unknown) => object(value) && ["z1", "z2", "z3", "z4", "z5"].every(key => object(value[key]) &&
  finite(value[key].low) && finite(value[key].high) && value[key].low > 0 && value[key].low <= value[key].high && value[key].high <= 300);
export const isTrainingProfileResponse = (value: unknown): value is { profile: any; zones: any; setup: any; planningReadiness: any } =>
  object(value) && "profile" in value && (value.profile === null || object(value.profile)) &&
    "zones" in value && (value.zones === null || (object(value.zones) && (value.zones.hr == null || heartRateTable(value.zones.hr)) &&
      (value.zones.bikeHr == null || heartRateTable(value.zones.bikeHr)) && (value.zones.anchorHr == null || finite(value.zones.anchorHr) && value.zones.anchorHr > 0 && value.zones.anchorHr <= 300))) &&
    object(value.planningReadiness) && typeof value.planningReadiness.ready === "boolean" &&
    ["missing", "review"].every(key => Array.isArray(value.planningReadiness[key]) && value.planningReadiness[key].every(text));

function todaySession(session: Record<string, any>) {
  const p = session.prescription;
  return sessionSummary(session) && optionalObject(session.preWorkoutWeight, weight => finite(weight.weightKg) && weight.weightKg >= 20 && weight.weightKg <= 350 && date(weight.observedAt) && date(weight.revision) && weight.source === "athlete_reported") && textFields(session, ["resolutionReason", "coachNotes"]) && object(p) && object(p.targets) && text(p.verdict) &&
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
    optionalObject(value.weekReview, week => week.coverage === "recorded_only" && week.usage === "local_display_only" && date(week.start) && date(week.end) && date(week.today) &&
      object(week.past) && ["available","unknown","review","restricted"].includes(week.past.status) && ["sessions","minutes"].every(key => week.past[key] == null || finite(week.past[key]) && week.past[key] >= 0) &&
      object(week.ahead) && ["sessions","minutes"].every(key => week.ahead[key] == null || finite(week.ahead[key]) && week.ahead[key] >= 0) &&
      optionalRecords(week.ahead.next, item => text(item.id) && date(item.date) && text(item.title) && (item.minutes == null || finite(item.minutes) && item.minutes >= 0))) &&
    optionalObject(value.athleteReview, review => finite(review.rawRecordCount) && (finite(review.possibleCopies) || (review.possibleCopies === null && object(review.derivedActivityPolicy) && review.derivedActivityPolicy.status === "insufficient" && text(review.derivedActivityPolicy.reason))) && (review.baselineWeeklyMinutes == null || finite(review.baselineWeeklyMinutes)) && optionalText(review.baselineObservedAt) && records(review.records, row => text(row.id) && text(row.title) && text(row.sport) && text(row.source) && ['minutes','rpe','distanceKm','paceSecondsPerKm','avgHr','avgPower','calories','preWeightKg','postWeightKg'].every(key => row[key] == null || finite(row[key])) && textFields(row,['actualDetails','feedbackStatus','feedbackNote','matchedPlanId']))) &&
    optionalObject(value.race, race => optionalText(race.name) && finite(race.daysAway)) &&
    optionalObject(value.cycle, cycle => textFields(cycle, ["start", "end", "status"]) && finite(cycle.weeks) && (cycle.currentWeek == null || finite(cycle.currentWeek))) &&
    optionalObject(value.motivation, motivation => textFields(motivation, ["quote", "message", "source"])) &&
    records(value.connectors, connector => text(connector.provider) && text(connector.status) && optionalText(connector.lastError)) &&
    optionalRecords(value.activityReports, report => text(report.id) && text(report.title) && text(report.headline) && text(report.body) && date(report.date));
