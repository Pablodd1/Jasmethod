import { dayOffProtocol, dayOffProtocolText } from "./day-off";
import type { dailyRecoveryContext } from "./daily-recovery";
import type { JMetrics } from "./j-metrics";
import { resolveCheckinSafety, type CheckinSafetyInput } from "./checkin-safety";

/** Proposals only. The authenticated review service owns binding and all writes. */
export interface CoachCandidate {
  id: string;
  kind: "profile" | "workout_feedback" | "workout_plan" | "checkin";
  field: string;
  value: string | number | boolean | null;
  unit: string | null;
  observedDate: string | null;
  source: "text" | "voice" | "image";
  evidence: string;
  sessionId?: string;
  status: "proposed";
  warnings?: string[];
}
export type CoachImageInput = { mimeType: "image/png" | "image/jpeg" | "image/webp"; dataBase64: string };
export interface ConversationInput { message: string; source: "text" | "voice"; externalConsent: boolean; textProviderConsent?: "gemini"; imageConsent: boolean; imageProviderConsent?: "openai"; image?: CoachImageInput }
export interface CandidateContext { localToday: string; sessionId?: string; sessionDate?: string; source?: "text" | "voice" | "image" }
export const COACH_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const COACH_GOALS = ["sprint", "olympic", "half", "full", "hyrox", "run-only", "track-sprint", "cycle", "swim-only", "5k", "10k", "half-marathon", "marathon"] as const;
export const COACH_SPORTS = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "other"] as const;
const imageTypes = ["image/png", "image/jpeg", "image/webp"] as const;
const normalize = (s: string) => s.replace(/(^|\s|[¿¡])sí(?=\s|[,.;!?]|$)/gi, "$1yes").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'");
function record(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object" && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x)); }
export function isCoachDate(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === x;
}
function shiftDate(day: string, offset: number): string { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }

/** Envelope validation only; coach-image performs actual byte decoding server-side. */
export function parseConversationInput(raw: unknown): ConversationInput {
  if (!record(raw) || Object.keys(raw).some(k => !["message", "source", "externalConsent", "textProviderConsent", "imageConsent", "imageProviderConsent", "image", "sessionId", "conversationId"].includes(k))) throw Error("Invalid conversation input");
  if (typeof raw.message !== "string" || raw.message.length > 4000) throw Error("Message must be at most 4000 characters");
  const message = raw.message.trim();
  if (raw.source !== undefined && raw.source !== "text" && raw.source !== "voice") throw Error("Invalid input source");
  if (raw.externalConsent !== undefined && typeof raw.externalConsent !== "boolean") throw Error("Choose explicit external AI consent");
  if (raw.imageConsent !== undefined && typeof raw.imageConsent !== "boolean") throw Error("Choose explicit image consent");
  if (raw.imageProviderConsent !== undefined && raw.imageProviderConsent !== "openai") throw Error("Invalid image provider consent");
  if (raw.textProviderConsent !== undefined && raw.textProviderConsent !== "gemini") throw Error("Invalid text provider consent");
  let image: CoachImageInput | undefined;
  if (raw.image !== undefined) {
    if (!record(raw.image) || Object.keys(raw.image).some(k => !["mimeType", "dataBase64"].includes(k)) || !imageTypes.includes(raw.image.mimeType as CoachImageInput["mimeType"]) || typeof raw.image.dataBase64 !== "string" || raw.image.dataBase64.length > Math.ceil(COACH_IMAGE_MAX_BYTES / 3) * 4 || (raw.image.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.image.dataBase64)) || !raw.image.dataBase64.length) throw Error("Use PNG, JPEG or WebP bytes, up to 2 MB; URLs are not accepted");
    image = { mimeType: raw.image.mimeType as CoachImageInput["mimeType"], dataBase64: raw.image.dataBase64 };
  }
  if (!message && !image) throw Error("Add a message or image");
  return { message, source: raw.source === "voice" ? "voice" : "text", externalConsent: raw.externalConsent === true, imageConsent: raw.imageConsent === true, ...(raw.textProviderConsent === "gemini" ? { textProviderConsent: "gemini" as const } : {}), ...(raw.imageProviderConsent === "openai" ? { imageProviderConsent: "openai" as const } : {}), ...(image ? { image } : {}) };
}

type Rule = { unit: string | null; type: "number" | "boolean" | "string"; min?: number; max?: number; integer?: boolean; values?: readonly string[] };
const fieldRules: Record<CoachCandidate["kind"], Record<string, Rule>> = {
  profile: {
    goal: { type: "string", unit: null, values: COACH_GOALS },
    weeklyHours: { type: "number", unit: "h/week", min: 0.5, max: 40 },
    weightKg: { type: "number", unit: "kg", min: 20, max: 350 },
  },
  workout_feedback: {
    feedbackStatus: { type: "string", unit: null, values: ["completed", "partial", "substituted", "skipped"] },
    actualDurationMin: { type: "number", unit: "min", min: 0, max: 1440, integer: true },
    rpe: { type: "number", unit: "0-10", min: 0, max: 10, integer: true },
    actualSport: { type: "string", unit: null, values: COACH_SPORTS },
  },
  workout_plan: { durationMin: { type: "number", unit: "min", min: 1, max: 1440, integer: true }, sport: { type: "string", unit: null, values: COACH_SPORTS } },
  checkin: {
    ...Object.fromEntries(["sleep", "soreness", "motivation", "energy", "stress"].map(k => [k, { type: "number", unit: "1-5", min: 1, max: 5, integer: true } as Rule])),
    ...Object.fromEntries(["sick", "newPain", "urgentSymptoms", "painAffectsMovement"].map(k => [k, { type: "boolean", unit: null } as Rule])),
    availableMinutes: { type: "number", unit: "min", min: 0, max: 1440, integer: true },
    painLocation: { type: "string", unit: null },
  },
};
const candidateKeys = new Set(["id", "kind", "field", "value", "unit", "observedDate", "source", "evidence", "sessionId", "status", "warnings"]);
const binding = (c: CoachCandidate) => `${c.kind}:${c.observedDate || ""}:${c.sessionId || ""}`;
const simpleId = (x: unknown): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(x);
/** No coercion, inferred measurements, URL ingestion, or model-authorized operations.
 * Invalid and conflicting fields are removed; callers surface clarification/review. */
export function validateCoachCandidates(raw: unknown, context: Pick<CandidateContext, "localToday" | "source"> & { allowStoredLegacyRpeUnit?: boolean }): CoachCandidate[] {
  if (!isCoachDate(context.localToday) || !Array.isArray(raw) || raw.length > 40) return [];
  const clean: CoachCandidate[] = [];
  const poisoned = new Set<string>();
  for (const c of raw) {
    if (!record(c) || Object.keys(c).some(k => !candidateKeys.has(k)) || !simpleId(c.id) || typeof c.kind !== "string" || !Object.hasOwn(fieldRules, c.kind) || typeof c.field !== "string" || !Object.hasOwn(fieldRules[c.kind as CoachCandidate["kind"]], c.field)) continue;
    const rule = fieldRules[c.kind as CoachCandidate["kind"]][c.field];
    // Only confirmation of persisted proposals opts into the retired unit label.
    const legacyRpeUnit = context.allowStoredLegacyRpeUnit === true && c.kind === "workout_feedback" && c.field === "rpe" && c.unit === "1-10" && typeof c.value === "number" && c.value >= 1 && c.value <= 10;
    if (c.status !== "proposed" || !["text", "voice", "image"].includes(c.source as string) || (context.source && context.source !== c.source) || (c.unit !== rule.unit && !legacyRpeUnit) || typeof c.value !== rule.type || c.value === null) continue;
    if (typeof c.value === "number" && (!Number.isFinite(c.value) || c.value < rule.min! || c.value > rule.max! || (rule.integer && !Number.isInteger(c.value)))) continue;
    if (typeof c.value === "string" && (!c.value.trim() || c.value.length > (c.field === "painLocation" ? 120 : 100) || (rule.values && !rule.values.includes(c.value)))) continue;
    if (c.observedDate !== null && !isCoachDate(c.observedDate)) continue;
    if (c.kind !== "profile" && c.observedDate === null) continue;
    if (typeof c.observedDate === "string" && c.kind !== "workout_plan" && c.observedDate > context.localToday) continue;
    if (c.kind === "checkin" && c.observedDate !== context.localToday) continue;
    if (c.sessionId !== undefined && (!simpleId(c.sessionId) || !["workout_feedback", "workout_plan"].includes(c.kind))) continue;
    if (typeof c.evidence !== "string" || !c.evidence.trim() || c.evidence.length > 500) continue;
    if (c.warnings !== undefined && (!Array.isArray(c.warnings) || c.warnings.length > 5 || c.warnings.some(x => typeof x !== "string" || x.length > 200))) continue;
    const candidate = { ...c } as unknown as CoachCandidate;
    const key = `${binding(candidate)}:${candidate.field}`;
    const duplicate = clean.find(p => `${binding(p)}:${p.field}` === key);
    if (duplicate && duplicate.value !== candidate.value) poisoned.add(key);
    else if (!duplicate) clean.push(candidate);
  }
  // Duplicate IDs are not safe review selectors, even across distinct fields.
  const duplicateIds = new Set(clean.filter((c, i) => clean.findIndex(x => x.id === c.id) !== i).map(c => c.id));
  const inconsistentGroups = new Set<string>([...poisoned].filter(k => k.endsWith(":feedbackStatus")).map(k => k.slice(0, -":feedbackStatus".length)));
  for (const c of clean) {
    if (c.kind !== "workout_feedback") continue;
    const group = clean.filter(x => binding(x) === binding(c));
    const outcome = group.find(x => x.field === "feedbackStatus");
    if (outcome?.value === "skipped" && group.some(x => x.field !== "feedbackStatus")) inconsistentGroups.add(binding(c));
    if (group.some(x => x.field === "actualDurationMin" && x.value === 0) && outcome && outcome.value !== "skipped") inconsistentGroups.add(binding(c));
  }
  return clean.filter(c => !duplicateIds.has(c.id) && !poisoned.has(`${binding(c)}:${c.field}`) && !inconsistentGroups.has(binding(c)));
}

const uncertain = /\b(?:if|maybe|perhaps|might|would|hypothetically|suppose|not sure|unsure|si|quizas?|tal vez|podria|hipoteticamente|supongamos|no se|no estoy segur[oa])\b/;
const injected = /(?:<\/?(?:system|assistant|tool)\b|ignore (?:all |previous |the )?instructions|ignora (?:las )?instrucciones|\b(?:system|developer)\s*:)/;
function dateIn(text: string, localToday: string): { date: string | null; ambiguous: boolean } {
  const keys = new Set<string>();
  for (const match of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) { if (!isCoachDate(match[0])) return { date: null, ambiguous: true }; keys.add(match[0]); }
  if (/\b(today|hoy)\b/.test(text)) keys.add(localToday);
  if (/\b(yesterday|ayer)\b/.test(text)) keys.add(shiftDate(localToday, -1));
  if (/\b(tomorrow|manana)\b/.test(text)) keys.add(shiftDate(localToday, 1));
  if (/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(text.replace(/\d{4}-\d{2}-\d{2}/g, "").replace(/\b(?:rpe|sleep|sueno|soreness|motivation|motivacion|energy|energia|stress|estres)\s*(?:was|is|of|de|fue|es|:|=)?\s*\d+\s*\/\s*\d+\b/g, "")) || /\b(last|next|pasad[oa]|proxim[oa])\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|lunes|martes|miercoles|jueves|viernes|sabado|domingo|semana)\b/.test(text)) return { date: null, ambiguous: true };
  return { date: keys.size === 1 ? [...keys][0] : null, ambiguous: keys.size > 1 };
}
function sportsIn(text: string): string[] {
  const patterns: Record<string, RegExp> = { run: /\b(run|ran|running|jogged|jogging|correr|corri|corrida|carrera(?: a pie)?|trote)\b/, bike: /\b(bike|biked|cycling|cycled|rode|bicicleta|bici|ciclismo|pedalee)\b/, swim: /\b(swim|swam|swimming|nadar|nade|natacion)\b/, strength: /\b(strength|weights|lifting|fuerza|pesas)\b/, mobility: /\b(mobility|movilidad)\b/, recovery: /\b(recovery|recuperacion)\b/, hyrox: /\bhyrox\b/, boxing: /\b(boxing|boxeo)\b/, brick: /\bbrick\b/ };
  return Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([sport]) => sport);
}
function stableId(text: string): string { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return `candidate_${(hash >>> 0).toString(16)}`; }
function allNumbers(text: string, regex: RegExp): number[] { return [...text.matchAll(regex)].map(m => Number(m[1].replace(",", "."))); }
function unique<T>(values: T[]): T[] { return [...new Set(values)]; }

/** Intentionally conservative grammar: voice is a transcript, never measured data.
 * Explicit current facts become unchecked proposals; uncertain language remains a question. */
export function extractLocalCandidates(message: string, context: CandidateContext): CoachCandidate[] {
  if (typeof message !== "string" || message.length > 4000 || !isCoachDate(context.localToday)) return [];
  const text = normalize(message);
  if (/\b(?:my (?:friend|partner|wife|husband|coach)|he|she|they|mi (?:amig[oa]|pareja|espos[oa]|entrenador)|el atleta|ella)\b/.test(text)) return [];
  const deniesCompletion = /\b(?:did not|didn't|have not|haven't|never|not|no|nunca)\s+(?:(?:actually|really|fully|ever|realmente)\s+)?(?:complete|finish|completed|finished|completado|terminado|complete|termine)\b/.test(text);
  if (uncertain.test(text) || injected.test(text) || /[“”"]/.test(message)) return [];
  const candidates: CoachCandidate[] = [];
  const add = (kind: CoachCandidate["kind"], field: string, value: CoachCandidate["value"], date: string | null, evidence: string, warning?: string) => {
    const data = { kind, field, value, unit: fieldRules[kind][field].unit, observedDate: date, source: context.source || "text", evidence: evidence.trim().slice(0, 500), status: "proposed" as const, ...((kind === "workout_feedback" || kind === "workout_plan") && context.sessionId ? { sessionId: context.sessionId } : {}), ...(warning ? { warnings: [warning] } : {}) };
    candidates.push({ id: stableId(JSON.stringify(data)), ...data });
  };
  const globalDate = dateIn(text, context.localToday);
  const historicalProfile = /\b(?:last year|last month|last week|previously|used to|my old|my previous|my former|antes|el ano pasado|el mes pasado|mi antiguo|mi anterior)\b/.test(text);
  const uncertainNumber = /\b(?:less than|more than|up to|at least|around|about|approximately|menos de|mas de|hasta|aproximadamente)\s+\d|\b\d+(?:[.,]\d+)?\s*(?:-|to|a|or|o)\s*\d+\s*(?:hours?|horas?|kg|lb)/.test(text);
  // A target is a preference, never a pace, power, HR or physiological reference.
  if (!historicalProfile && /\b(?:my (?:goal|target)\s*(?:is(?!n't|\s+(?:not|no longer))\b|:)|i am training for|i'm training for|i want to (?:run|finish|complete)|mi (?:objetivo|meta)\s*(?:es\b(?!\s+no)|:)|entreno para|quiero (?:correr|completar|terminar))/.test(text)) {
    const goals: [string, RegExp][] = [["half-marathon", /\b(half[ -]marathon|media maraton|medio maraton)\b/], ["marathon", /\b(marathon|maraton)\b/], ["10k", /\b10\s?k(?:m)?\b/], ["5k", /\b5\s?k(?:m)?\b/], ["olympic", /\b(olympic|olimpico|olimpica)\b/], ["sprint", /\bsprint triathlon\b|\btriatlon sprint\b/], ["half", /\b(70\.3|half ironman)\b/], ["full", /\b(full ironman|ironman completo|140\.6)\b/], ["hyrox", /\bhyrox\b/]];
    const found = goals.filter(([, pattern]) => pattern.test(text)).map(([goal]) => goal).filter(g => g !== "marathon" || !/\b(half[ -]marathon|media maraton|medio maraton)\b/.test(text));
    if (found.length === 1) add("profile", "goal", found[0], null, message);
  }
  const hours = unique(allNumbers(text, /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|horas?|h)\s*(?:per week|a week|weekly|\/week|por semana|a la semana|semanales)\b/g));
  if (!historicalProfile && !uncertainNumber && !/\b(?:can't|cannot|can not|could|no puedo|no tengo|no entreno|not available)\b/.test(text) && hours.length === 1 && /\b(i can|i have|i train|i am available|i'm available|my (?:weekly )?availability|tengo|puedo|entreno|disponibilidad)\b/.test(text)) add("profile", "weeklyHours", hours[0], null, message);
  const weights = [...text.matchAll(/\b(?:i weigh|my weight is|weight\s*:|peso(?: actual)?\s*(?:es|:)?|mi peso es)\s*(\d+(?:[.,]\d+)?)\s*(kg|kilograms?|kilos?|lb|lbs|pounds?|libras?)\b/g)].map(m => ({ value: Number(m[1].replace(",", ".")) * (/^(lb|pound|libra)/.test(m[2]) ? 0.45359237 : 1), unit: m[2] }));
  if (!historicalProfile && !uncertainNumber && weights.length && unique(weights.map(w => w.value)).length === 1 && !/\b(goal weight|target weight|want to weigh|quiero pesar|peso objetivo|peso deseado)\b/.test(text) && !globalDate.ambiguous) add("profile", "weightKg", Math.round(weights[0].value * 100) / 100, globalDate.date, message, /^(lb|pound|libra)/.test(weights[0].unit) ? "Converted from explicitly reported pounds to kg; review the conversion." : undefined);
  const clauses = message.split(/\n|;|(?<=[.!?])\s+|\b(?:but|pero)\b/i).filter(Boolean);
  for (const clause of clauses) {
    const t = normalize(clause);
    if (/\b(?:reading|researching|watching|video|book|article|leer|leyendo|investigar|investigando|viendo|libro|articulo)\b/.test(t)) continue;
    if (/\b(?:not|never|didn't|did not|no|nunca)\s+(?:run|ran|complete|completed|finish|finished|plan|planned|planning|swim|swam|ride|rode|correr|corri|complete|termine|planifique|planeo)\b/.test(t)) continue;
    const ownDate = dateIn(t, context.localToday);
    if (ownDate.ambiguous) continue;
    const date = ownDate.date || (!globalDate.ambiguous ? globalDate.date || (isCoachDate(context.sessionDate) ? context.sessionDate : null) : null);
    const planned = /\b(plan(?:ned)? to|planning to|will|going to|want to|schedule|planned|planeo|planifique|voy a|quiero|programado|planificado)\b/.test(t);
    const explicitCompletion = /\b(completed|finished|complete|termine)\b/.test(t);
    const completed = explicitCompletion || /\b(?:i (?:ran|swam|rode|cycled|biked|jogged)|corri|nade|pedalee)\b/.test(t) || /\b(?:i did|hice|realice)\s+(?:(?:a|an|my|mi|una?|the)\s+)?(?:run|swim|ride|workout|session|carrera|sesion|entrenamiento)\b/.test(t);
    const skipped = /\b(skipped|missed|me salte|omiti|no hice)\b/.test(t);
    const partial = /\b(partial|partially|only completed|stopped early|parcial|parcialmente|solo complete|pare antes)\b/.test(t);
    if (!date || (planned && (completed || skipped))) continue;
    const sports = sportsIn(t);
    if (sports.length > 1) continue;
    const minuteMatches = allNumbers(t, /\b(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?|minutos?)\b/g);
    const hourMatches = allNumbers(t, /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|horas?)\b(?!\s*(?:per week|a week|weekly|por semana|a la semana|semanales))/g).map(n => n * 60);
    const durations = unique([...minuteMatches, ...hourMatches]);
    if (durations.length > 1 || /\b\d+\s*(?:-|to|a|or|o)\s*\d+\s*(?:min|hour|hora)/.test(t)) continue;
    const kind = planned ? "workout_plan" : "workout_feedback";
    if (!planned && !completed && !skipped && !partial) continue;
    if (skipped) { if (!durations.length && !/\brpe\b/.test(t)) add(kind, "feedbackStatus", "skipped", date, clause); continue; }
    if (!planned && (explicitCompletion || partial)) add(kind, "feedbackStatus", partial ? "partial" : "completed", date, clause);
    if (durations.length === 1) add(kind, planned ? "durationMin" : "actualDurationMin", durations[0], date, clause);
    if (sports.length === 1) add(kind, planned ? "sport" : "actualSport", sports[0], date, clause);
    const rpes = unique(allNumbers(t, /\brpe\s*(?:was|of|de|fue|:|=)?\s*(\d+(?:[.,]\d+)?)\b/g));
    if (!planned && rpes.length === 1 && !/\brpe\s*(?:was|of|de|fue|:|=)?\s*\d+\s*\/\s*(?!10\b)\d+/.test(t)) add(kind, "rpe", rpes[0], date, clause);
  }
  // Check-in ratings require explicit scale and current local date, never inferred from adjectives.
  if (globalDate.date === context.localToday && !globalDate.ambiguous && !/\b(yesterday|ayer|last|pasad[oa])\b/.test(text)) {
    const names: Record<string, string> = { sleep: "sleep|sueno", soreness: "soreness|dolor muscular", motivation: "motivation|motivacion", energy: "energy|energia", stress: "stress|estres" };
    for (const [field, namesRe] of Object.entries(names)) {
      const values = unique(allNumbers(text, new RegExp(`\\b(?:${namesRe})\\s*(?:is|was|es|:|=)?\\s*(\\d+)\\s*\\/\\s*5\\b`, "g")));
      if (values.length === 1) add("checkin", field, values[0], context.localToday, message);
    }
    const safetyStatements: [string, RegExp, RegExp][] = [
      ["sick", /\b(?:i am sick|i'm sick|i feel sick|i have illness symptoms|estoy enferm[oa]|me siento enferm[oa]|tengo sintomas de enfermedad)\b/, /\b(?:i am not sick|i'm not sick|i have no illness symptoms|no estoy enferm[oa]|no tengo sintomas de enfermedad)\b/],
      ["newPain", /\b(?:i have new pain|tengo dolor nuevo)\b/, /\b(?:i have no new pain|no tengo dolor nuevo)\b/],
      ["painAffectsMovement", /\b(?:pain affects my movement|pain changes my gait|el dolor afecta mi movimiento)\b/, /\b(?:pain does not affect my movement|el dolor no afecta mi movimiento)\b/],
    ];
    for (const [field, positive, negative] of safetyStatements) {
      const yes = positive.test(text), no = negative.test(text);
      if (yes !== no) add("checkin", field, yes, context.localToday, message);
    }
    const available = unique(allNumbers(text, /\b(?:i have|i can spare|tengo|dispongo de)\s*(\d+)\s*(?:minutes?|mins?|minutos?)\s*(?:available|to train|for training|disponibles|para entrenar)\b/g));
    if (available.length === 1) add("checkin", "availableMinutes", available[0], context.localToday, message);
  }
  return validateCoachCandidates(deniesCompletion ? candidates.filter(c => c.kind !== "workout_feedback") : candidates, context);
}

export function conversationClarifications(message: string, context: CandidateContext): string[] {
  const t = normalize(message);
  const es = /\b(hoy|ayer|manana|peso|quiero|entrenar|corri|minutos|horas|cansad[oa])\b/.test(t);
  const result: string[] = [];
  if (uncertain.test(t) || injected.test(t) || /[“”"]/.test(message)) result.push(es ? "Aclara qué datos son tuyos y confirmados, fuera de ejemplos, citas o posibilidades." : "Clarify which facts are yours and confirmed, rather than examples, quotations or possibilities.");
  const dates = isCoachDate(context.localToday) ? dateIn(t, context.localToday) : { date: null, ambiguous: true };
  if (dates.ambiguous) result.push(es ? "Confirma una fecha por sesión en formato AAAA-MM-DD." : "Confirm one date per session using YYYY-MM-DD.");
  if (/\b(ran|swam|rode|completed|finished|corri|nade|hice|termine|complete|skipped|missed|plan|planned|planeo|voy a)\b/.test(t) && !dates.date && !isCoachDate(context.sessionDate)) result.push(es ? "¿En qué fecha ocurrió o está prevista la sesión? Distingue lo realizado de lo planeado." : "What date was the session completed or planned? Keep actual work separate from planned work.");
  if (/\b\d+\s*(?:-|to|a|or|o)\s*\d+\s*(?:min|hour|hora|kg)/.test(t)) result.push(es ? "Confirma un único valor y su unidad; no usaré el promedio del intervalo." : "Confirm a single value and its unit; I will not average an uncertain range.");
  return unique(result);
}

export interface CoachReplyContext {
  recovery?: ReturnType<typeof dailyRecoveryContext>;
  jMetrics?: JMetrics | null;
  localToday: string;
  language?: string;
  approvedSession?: { id: string; title?: string; sport?: string; durationMin?: number; date: string; isRestDay?: boolean; hasWarmup?: boolean; approved: true } | null;
  checkin?: (CheckinSafetyInput & { observedDate: string; recordedAt?: string | null }) | null;
  declinedOptional?: string[];
  setupReady?: boolean;
  unresolvedSafetyConcernAt?: string | null;
  unreviewedImageConcern?: "urgent" | "symptom";
  recentMessages?: { role: "user" | "assistant"; content: string; createdAt?: string }[];
  profile?: { goal?: string | null; experience?: string | null; weeklyHours?: number | null; weightKg?: number | null } | null;
  recentFeedback?: { date: string; feedbackStatus?: string | null; actualDurationMin?: number | null; rpe?: number | null; actualSport?: string | null }[];
}
export interface CoachReply { answer: string; ruleId: string; sourceIds?: string[] }
function symptomText(value: string, keepQuotes = false): string {
  return (keepQuotes ? value : value.replace(/["“][^"”]*["”]/g, ""))
    .replace(/\b(?:no|not|without|denies|sin|niego|i do not have|i don't have|no tengo|no estoy)\s+(?:current\s+)?(?:chest pain|chest discomfort|chest tightness|fainting|severe breathlessness|new pain|pain(?: or illness)?|illness|sick|injured|dizzy|dizziness|nauseated|nauseous|nausea|breathlessness|fever|tired|fatigued|exhausted|dolor (?:en el )?pecho|dolor nuevo|dolor|enferm[oa]|lesionad[oa]|maread[oa]|mareo|fiebre|cansad[oa]|fatiga|desmayo|falta de aire)\b/g, "");
}
function timestamp(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  if (!isCoachDate(value.slice(0, 10))) return null;
  const ms = Date.parse(value); return Number.isFinite(ms) ? ms : null;
}
const concern = /\b(?:pain\w*|hurt\w*|injur\w*|fever\w*|illness\w*|sick\w*|dizz\w*|faint\w*|breath\w*|nause\w*|headache\w*|vomit\w*|diarrhea\w*|bleed\w*|fractur\w*|infect\w*|heart attack|cardiac|wheez\w*|shortness of breath|cefalea|vomit\w*|diarrea|sangrad\w*|infeccion|infarto|tired|fatigu\w*|exhaust\w*|dolor\w*|duele\w*|lesion\w*|mare\w*|fiebre|enferm\w*|cansad[oa]|agot\w*)\b/;
/** Product-policy coaching, not a validated intent classifier or medical clearance. */
export function buildCoachReply(message: string, context: CoachReplyContext): CoachReply {
  const t = normalize(message);
  const es = context.language === "es" || (!context.language && /\b(hoy|ayer|quiero|entrenar|cansad[oa]|descansar)\b/.test(t));
  const reply = (rule: string, en: string, spanish: string, sourceIds?: string[]): CoachReply => ({ answer: es ? spanish : en, ruleId: `coach-conversation-v1:${rule}`, ...(sourceIds ? { sourceIds } : {}) });
  const priorMessages = (context.recentMessages || []).slice(-16).filter(m => m.role === "user" && typeof m.content === "string" && m.content !== message);
  const prior = priorMessages.map(m => normalize(m.content.slice(0, 4000)));
  const priorRestChoice = prior.some(p => /\b(i (?:have decided to|decided to|choose(?: to)?) rest|i'm resting|no quiero entrenar|he decidido descansar|no voy a entrenar)\b/.test(p));
  const checkin = context.checkin?.observedDate === context.localToday ? context.checkin : null;
  const safety = resolveCheckinSafety(checkin);
  const checkedAt = safety.status === "clear" ? timestamp(checkin?.recordedAt) : null;
  const persistedConcernAt = timestamp(context.unresolvedSafetyConcernAt);
  const pendingSafety = (persistedConcernAt !== null && (checkedAt === null || checkedAt <= persistedConcernAt)) || priorMessages.some(m => {
    const p = normalize(m.content.slice(0, 4000));
    if (!concern.test(symptomText(p)) || uncertain.test(p) || /\b(history of|last week|last month|semana pasada|mes pasado)\b/.test(p)) return false;
    const reportedAt = timestamp(m.createdAt);
    return checkedAt === null || reportedAt === null || checkedAt <= reportedAt;
  });
  const current = symptomText(t, true);
  const historical = /\b(yesterday|last week|last month|used to|history of|ayer|semana pasada|antes tenia|hace \d+ dias)\b/.test(t);
  const hypothetical = uncertain.test(t) || /[“”"]/.test(message);
  const urgentPattern = /\b(chest pain|chest discomfort|(?:my )?chest (?:hurts|tightness|feels tight)|chest tightness|(?:i )?feel faint|feeling faint|fainting|fainted|severe (?:unexplained )?breathlessness|confusion|collapse|dolor (?:en el )?pecho|me duele (?:el )?pecho|me desmaye|desmayo|falta de aire intensa|confusion|colapso)\b/;
  const urgent = urgentPattern.test(current);
  const thirdPerson = /\b(?:my (?:friend|partner|wife|husband|coach)|he|she|they|mi (?:amig[oa]|pareja|espos[oa])|ella)\b/;
  // A hypothetical question in another sentence must not erase an explicit
  // current symptom report. Quoted material is removed before this check.
  const currentUrgent = symptomText(t).split(/[.!?;]|\b(?:and|but|pero|y)\b/).some(clause => urgentPattern.test(clause)
    && !uncertain.test(clause) && !thirdPerson.test(clause)
    && (!/\b(yesterday|last week|last month|used to|history of|ayer|semana pasada|antes tenia|hace \d+ dias)\b/.test(clause) || /\b(now|currently|right now|ahora|hoy)\b/.test(clause)));

  if (safety.status === "urgent" || currentUrgent) return reply("urgent-symptoms", "Stop exercise. Chest discomfort, fainting, severe unexplained breathlessness, confusion or collapse need urgent medical assessment. If symptoms are severe or ongoing, contact local emergency services now. I cannot diagnose this or clear you to resume.", "Detén el ejercicio. El dolor de pecho, el desmayo, la dificultad respiratoria intensa e inexplicable, la confusión o el colapso requieren valoración médica urgente. Si los síntomas son intensos o continúan, contacta ahora con emergencias locales. No puedo diagnosticar ni autorizar la vuelta al entrenamiento.");
  if (urgent && thirdPerson.test(current)) return reply("clarify-symptom-timing", "If that person has current chest discomfort, fainting or severe unexplained breathlessness, they should stop exercise and seek urgent assessment, with local emergency services for severe or ongoing symptoms. Are you also reporting symptoms of your own? I won't infer your readiness from someone else's report.", "Si esa persona tiene dolor de pecho, desmayo o dificultad respiratoria intensa e inexplicable actuales, debe detener el ejercicio y buscar valoración urgente, con emergencias locales si son intensos o continúan. ¿Tú también tienes síntomas? No inferiré tu disposición a partir de lo que le pasa a otra persona.");
  if (context.unreviewedImageConcern === "urgent") return reply("unreviewed-image-urgent", "The image may describe urgent symptoms, but extraction is not confirmation. If these symptoms are yours and current, stop exercise and seek urgent medical assessment; contact local emergency services if severe or ongoing. Verify the image and date. No activity is recommended or data saved from the image alone.", "La imagen podría describir síntomas urgentes, pero la extracción no los confirma. Si son tuyos y actuales, detén el ejercicio y busca valoración médica urgente; contacta con emergencias locales si son intensos o continúan. Verifica la imagen y la fecha. La imagen por sí sola no recomienda actividad ni guarda datos.");
  if (/\b(i (?:have decided to|decided to|choose(?: to)?|am choosing(?: to)?) rest|i'm resting|i am resting|i will not train|i won't train|stop (?:pushing|asking)|no quiero entrenar|he decidido descansar|voy a descansar|no voy a entrenar|dejame descansar)\b/.test(t)) return reply("respect-rest-choice", "Your choice to rest is respected. There is no need to make up missed work or justify the decision. Resume with a fresh check-in when you choose; I have not changed or marked any session completed.", "Respeto tu decisión de descansar. No necesitas compensar lo pendiente ni justificarla. Cuando decidas retomar, haz un nuevo check-in; no he cambiado ni marcado ninguna sesión como realizada.");
  const illnessOrPain = /\b(i (?:am|feel|have) (?:sick|ill|injured|(?:a )?fever|(?:a )?new pain)|i'm injured|my (?:knee|ankle|hip|back|foot|leg|shoulder) hurts|i'm sick|(?:new|sharp|worsening) (?:knee|ankle|hip|back|focal) pain|pain (?:changes|affects) (?:my )?(?:gait|movement)|tengo fiebre|estoy enferm[oa]|dolor nuevo|me duele (?:la rodilla|el tobillo|el pecho)|dolor al (?:correr|caminar)|estoy lesionad[oa])\b/.test(symptomText(t));
  if (safety.status === "hold" || (illnessOrPain && !historical && !hypothetical)) return reply("illness-or-pain", "Pause training for illness or new/worsening focal pain. Do not exercise through pain that changes your movement. Seek appropriate medical advice, especially if symptoms persist or worsen. This conversation cannot diagnose or clear return to training.", "Pausa el entrenamiento si hay enfermedad o dolor focal nuevo o que empeora. No continúes con dolor que cambie tu movimiento. Busca asesoramiento médico, especialmente si persiste o empeora. Esta conversación no puede diagnosticar ni autorizar el regreso.");
  if (urgent || (illnessOrPain && (historical || hypothetical))) return reply("clarify-symptom-timing", "Are these symptoms happening to you now, or are you describing a past event or example? Do not start exercise while current symptoms are unclear. Current chest discomfort, fainting or severe unexplained breathlessness need urgent assessment.", "¿Estos síntomas te están ocurriendo ahora o describes algo pasado o un ejemplo? No empieces a entrenar mientras no esté claro. El dolor de pecho, desmayo o dificultad respiratoria intensa e inexplicable actuales requieren valoración urgente.");
  if (/\b(tired|fatigued|exhausted|worn out|cansad[oa]|fatiga|agotad[oa])\b/.test(t.replace(/\b(?:not|no estoy|sin)\s+(?:tired|fatigued|exhausted|cansad[oa]|fatiga|agotad[oa])\b/g, ""))) return reply("clarify-fatigue", "When you say tired, do you mean physical fatigue or poor recovery, illness/pain, or mostly low motivation? How do you feel today? I won't treat ambiguous fatigue as permission to push through; review today's safety check-in first.", "Cuando dices cansancio, ¿es fatiga física o mala recuperación, enfermedad/dolor, o sobre todo poca motivación? ¿Cómo estás hoy? No interpretaré un cansancio ambiguo como permiso para forzar; revisa primero el check-in de seguridad de hoy.");
  if (/\b(catch up|make up|double|twice|extra intervals|all[ -]?out|maximum effort|compensar|recuperar lo perdido|doblar|doble|a tope|esfuerzo maximo)\b/.test(t)) return reply("no-escalation", "Do not add missed work, double the session or turn it into an all-out effort. Keep the approved plan's limits and recovery days. A change needs a separate plan review with current recovery and safety information; feeling motivated alone does not justify extra load.", "No añadas lo pendiente, dobles la sesión ni la conviertas en un esfuerzo máximo. Respeta los límites y los días de recuperación del plan aprobado. Un cambio requiere revisar el plan con información actual de recuperación y seguridad; la motivación por sí sola no justifica más carga.");
  if (context.unreviewedImageConcern === "symptom") return reply("unreviewed-image-symptoms", "The image may contain a current safety or recovery concern. Verify whether those details describe you today and review the check-in before considering exercise. I won't replace confirmed facts or clear you to train from an unreviewed image.", "La imagen podría contener un problema actual de seguridad o recuperación. Verifica si esos datos te describen hoy y revisa el check-in antes de considerar ejercicio. No sustituiré datos confirmados ni autorizaré entrenar a partir de una imagen sin revisar.");
  if (concern.test(symptomText(t))) return reply("clarify-current-symptoms", "You mentioned a possible physical symptom. What is happening, and is it current? Pause exercise while the concern is unclear; don't push through it. Seek appropriate medical advice for persistent or worsening symptoms, and urgent help for severe symptoms.", "Mencionaste un posible síntoma físico. ¿Qué ocurre y está pasando ahora? Pausa el ejercicio mientras no esté claro; no lo fuerces. Busca asesoramiento médico si persiste o empeora, y ayuda urgente si los síntomas son intensos.");
  if (pendingSafety) return reply("clarify-prior-safety", "You shared new safety, recovery or available-time information. Before discussing a training start, does that information still apply, and has today's check-in been updated since then? An earlier check-in does not resolve newer information.", "Compartiste información nueva de seguridad, recuperación o tiempo disponible. Antes de hablar de empezar a entrenar, ¿sigue siendo válida y has actualizado el check-in de hoy desde entonces? Un check-in anterior no resuelve información posterior.");
  if (/\b(?:j ?metrics|jstress|j ?base|j ?recent|j ?balance)\b/.test(t)) {
    const metrics = context.jMetrics;
    const definition = "JStress = completed minutes × reported session RPE (0–10), in arbitrary units (AU). It uses the published session-RPE method, not provider or legacy load scores.";
    const definitionEs = "JStress = minutos completados × RPE reportado de la sesión (0–10), en unidades arbitrarias (AU). Usa el método publicado de sesión-RPE, no puntuaciones del proveedor ni cargas históricas.";
    if (!metrics || metrics.today !== context.localToday) return reply("jmetrics-unknown", `${definition} Current saved JMetrics are unavailable in this context. Report actual duration and overall effort after completing a session; do not treat missing values as zero. See /metrics for the method.`, `${definitionEs} Los JMetrics actuales guardados no están disponibles en este contexto. Reporta duración real y esfuerzo global tras completar la sesión; no trates los datos faltantes como cero. Consulta /metrics para el método.`);
    const shown = (n: number | null) => typeof n === "number" && Number.isFinite(n) ? `${n} AU` : es ? "desconocido" : "unknown";
    const day = metrics.series.find(point => point.date === context.localToday);
    const line = `JStress (${context.localToday}): ${shown(day?.jStress ?? null)}. J Recent: ${shown(metrics.current.jRecent)}. J Base: ${shown(metrics.current.jBase)}. J Balance: ${shown(metrics.current.jBalance)}.`;
    return reply("jmetrics-recorded-summary",
      `${definition}\n${line}\nLast ${metrics.windowDays} days: ${metrics.eligibleSessions}/${metrics.totalSessions} performed sessions have scoreable inputs; ${metrics.missingDays} days are unknown. Recorded-session total: ${shown(metrics.totalJStress)} (partial when inputs are missing). J Recent/J Base use 7/42-day exponential averages and require 7/42 consecutive known days; gaps restart them. J Balance = J Base − J Recent. A planned rest day is not confirmed rest. These values do not diagnose recovery or establish a safe training dose. Details: /metrics.`,
      `${definitionEs}\n${line}\nÚltimos ${metrics.windowDays} días: ${metrics.eligibleSessions}/${metrics.totalSessions} sesiones realizadas tienen datos suficientes; ${metrics.missingDays} días son desconocidos. Total de sesiones registradas: ${shown(metrics.totalJStress)} (parcial si faltan datos). J Recent/J Base usan promedios exponenciales de 7/42 días y requieren 7/42 días conocidos consecutivos; los vacíos los reinician. J Balance = J Base − J Recent. Un descanso planeado no es un descanso confirmado. Estos valores no diagnostican recuperación ni establecen una dosis segura de entrenamiento. Detalles: /metrics.`);
  }
  if (/\b(?:recovery|rest day|day off|meditation|visualization|visualisation|recuperacion|dia de descanso|dia libre|meditacion|visualizacion)\b/.test(t)) {
    const recovery = context.recovery;
    if (recovery?.mode === "planned-rest") {
      const allowMovement = recovery.allowMovement === true && safety.status === "clear";
      return reply("recovery-day-guide", dayOffProtocolText("en", { allowMovement }), dayOffProtocolText("es", { allowMovement }));
    }
    if (recovery?.mode === "hold") return reply("recovery-hold-guide",
      `Training is on hold. Optional exercise is not offered; review the restriction with your coach or appropriate professional.\n${dayOffProtocolText("en")}`,
      `El entrenamiento está en pausa. No se ofrece ejercicio opcional; revisa la restricción con tu entrenador o profesional adecuado.\n${dayOffProtocolText("es")}`);
    const support = (lang: "en" | "es") => {
      const guide = dayOffProtocol(lang);
      return [...guide.essentials.filter(item => item.key !== "movement").map(item => `${item.icon} ${item.label} — ${item.detail}`), guide.visualizationShort].join("\n");
    };
    return reply("daily-recovery-support",
      `${recovery?.mode === "training" || recovery?.mode === "easy-day" ? "Recovery supports today's existing training; keep its reviewed limits." : "I do not have a confirmed planned rest day in this context. An empty schedule does not establish recovery or a rest prescription."} No extra 20-minute workout is added.\n${support("en")}`,
      `${recovery?.mode === "training" || recovery?.mode === "easy-day" ? "La recuperación acompaña el entrenamiento existente de hoy; mantén sus límites revisados." : "No tengo un día de descanso planificado confirmado en este contexto. Una agenda vacía no demuestra recuperación ni prescribe descanso."} No se añade un entrenamiento extra de 20 minutos.\n${support("es")}`);
  }
  const session = context.approvedSession?.approved === true && context.approvedSession.date === context.localToday ? context.approvedSession : null;
  if (session?.isRestDay || session?.sport === "rest" || session?.durationMin === 0) return reply("preserve-rest-day", "Today is an approved recovery/rest day. Protect it rather than replacing it with a workout. Recovery is part of the plan; any change should be reviewed separately, and no missed work is added.", "Hoy hay descanso o recuperación aprobados. Respétalos en lugar de sustituirlos por un entrenamiento. La recuperación forma parte del plan; cualquier cambio se revisa por separado y no se añade trabajo pendiente.");
  const avoidance = /\b(don't feel like|do not feel like|no motivation|low motivation|unmotivated|can't be bothered|lazy|skip|avoid|no tengo ganas|poca motivacion|sin motivacion|pereza|saltarme|evitar)\b/.test(t);
  if (priorRestChoice && avoidance && !/\b(changed my mind|ready to train|he cambiado de opinion|quiero entrenar ahora)\b/.test(t)) return reply("respect-prior-rest-choice", "You already chose rest, and I respect that. We can review what made today difficult without turning it into pressure to train. No catch-up work is owed.", "Ya elegiste descansar y lo respeto. Podemos revisar qué lo dificultó hoy sin presionarte para entrenar. No debes compensar trabajo pendiente.");

  if (avoidance && safety.status === "clear" && session && context.setupReady !== false) {
    const title = typeof session.title === "string" ? session.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const goal = context.profile?.goal && COACH_GOALS.includes(context.profile.goal as typeof COACH_GOALS[number]) ? context.profile.goal : null;
    const basis = title ? `The approved session is “${title}”. ` : "";
    const basisEs = title ? `La sesión aprobada es «${title}». ` : "";
    const purpose = goal ? `Your saved ${goal} goal is the context; today’s process target is controlled execution within the approved limits, without promising an outcome. ` : "The purpose is controlled execution of the approved work, without adding load. ";
    const purposeEs = goal ? `Tu objetivo guardado ${goal} da el contexto; hoy se busca una ejecución controlada dentro de los límites aprobados, sin prometer un resultado. ` : "El objetivo es realizar el trabajo aprobado de forma controlada, sin añadir carga. ";
    const first = session.hasWarmup === true ? "the warm-up already in today's approved session" : "the first step already in today's approved session";
    const firstEs = session.hasWarmup === true ? "el calentamiento ya previsto en la sesión aprobada de hoy" : "el primer paso ya previsto en la sesión aprobada de hoy";
    return reply("support-planned-start", `${basis}${purpose}If this is low motivation rather than illness, pain or physical fatigue, I recommend starting only ${first}, then reassessing how you feel. Keep the existing limits; stop for symptoms. You can choose to continue within the plan or stop. Is the main barrier starting, timing, or something else?`, `${basisEs}${purposeEs}Si es poca motivación y no enfermedad, dolor o fatiga física, te recomiendo empezar solo ${firstEs} y después valorar cómo te sientes. Mantén los límites existentes y detente si aparecen síntomas. Puedes seguir dentro del plan o parar. ¿La principal dificultad es empezar, el horario o algo más?`);
  }
  if (avoidance) return reply("clarify-barrier", "What's behind wanting to skip: time, low motivation, physical fatigue, illness or pain? A small planned start can help with reluctance, but I need today's safety check-in and an approved session before recommending activity. Your decision remains yours; there is no catch-up requirement.", "¿Qué hay detrás de querer saltártelo: tiempo, poca motivación, fatiga física, enfermedad o dolor? Un inicio pequeño y planificado puede ayudar con la resistencia a empezar, pero necesito el check-in de hoy y una sesión aprobada antes de recomendar actividad. Tú decides y no hay obligación de compensar.");
  if (/\b(?:what (?:is|are) my (?:weekly (?:hours|availability)|available (?:time|hours))|how (?:many hours|much time) (?:do i have|can i train)|cual es mi disponibilidad|cuantas horas tengo)\b/.test(t)) {
    const hours = context.profile?.weeklyHours;
    if (typeof hours === "number" && Number.isFinite(hours) && hours >= 0.5 && hours <= 40) return reply("remember-confirmed-availability", `Your saved weekly availability is ${hours} hours. This is a scheduling limit, not a requirement to fill every hour or make up missed training.`, `Tu disponibilidad semanal guardada es de ${hours} horas. Es un límite de agenda, no una obligación de completar todas las horas ni compensar entrenamientos perdidos.`);
    return reply("missing-confirmed-availability", "I don't have confirmed weekly availability in this context. Tell me how many hours per week are realistically available, and review the proposed update before saving it.", "No tengo una disponibilidad semanal confirmada en este contexto. Dime cuántas horas por semana tienes realmente disponibles y revisa la propuesta antes de guardarla.");
  }
  if (/\b(?:how (?:was|did) my (?:last|latest|recent) (?:workout|session|run)|what (?:was|did i do (?:in|for)) my (?:last|latest) (?:(?:recorded|reported) )?(?:workout|session)|my recent training|como (?:fue|me fue en) mi ultima (?:sesion|carrera)|mi entrenamiento reciente)\b/.test(t)) {
    const latest = (context.recentFeedback || []).filter(f => isCoachDate(f.date) && f.date <= context.localToday).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) return reply("missing-reported-history", "I don't have a confirmed recent session report in this context. Tell me the session date, actual outcome, minutes and overall RPE; planned minutes are not proof of what happened.", "No tengo un informe confirmado de una sesión reciente en este contexto. Dime fecha, resultado real, minutos y RPE global; los minutos previstos no demuestran lo realizado.");
    const outcome = ["completed", "partial", "substituted", "skipped"].includes(latest.feedbackStatus || "") ? latest.feedbackStatus : null;
    const minutes = typeof latest.actualDurationMin === "number" && Number.isFinite(latest.actualDurationMin) && latest.actualDurationMin >= 0 && latest.actualDurationMin <= 1440 ? latest.actualDurationMin : null;
    const rpe = typeof latest.rpe === "number" && Number.isInteger(latest.rpe) && latest.rpe >= 0 && latest.rpe <= 10 ? latest.rpe : null;
    return reply("remember-reported-history", `Your latest reported session is dated ${latest.date}: outcome ${outcome || "unknown"}, actual duration ${minutes === null ? "unknown" : `${minutes} min`}, overall RPE ${rpe === null ? "unknown" : `${rpe}/10`}. These are reported facts, not proof of readiness today; no missing values are filled from the plan.`, `Tu última sesión informada tiene fecha ${latest.date}: resultado ${outcome || "desconocido"}, duración real ${minutes === null ? "desconocida" : `${minutes} min`}, RPE global ${rpe === null ? "desconocido" : `${rpe}/10`}. Son datos informados, no prueba de disposición para hoy; no se completan datos ausentes con el plan.`);
  }
  if (/\b(what (?:was|is) my goal|remind me (?:of )?my goal|cual (?:era|es) mi (?:meta|objetivo))\b/.test(t)) {
    const goal = context.profile?.goal;
    if (goal && COACH_GOALS.includes(goal as typeof COACH_GOALS[number])) return reply("remember-confirmed-goal", `Your saved goal is ${goal}. We can choose a controllable next step within your approved plan; the goal itself does not establish training pace or readiness.`, `Tu objetivo guardado es ${goal}. Podemos elegir un siguiente paso controlable dentro del plan aprobado; el objetivo no establece tu ritmo ni tu disposición para entrenar.`);
    const mentioned = prior.flatMap(p => extractLocalCandidates(p, { localToday: context.localToday })).filter(c => c.kind === "profile" && c.field === "goal").at(-1);
    if (mentioned) return reply("remember-proposed-goal", `You mentioned ${mentioned.value} in this conversation. That was a proposed goal; I cannot assume it was saved. Review the goal before planning around it.`, `Mencionaste ${mentioned.value} en esta conversación. Era una propuesta de objetivo; no puedo asumir que se guardó. Revísalo antes de planificar en torno a él.`);
  }
  if (/\b(goal|target|motivation|consistent|consistency|habit|objetivo|meta|motivacion|constancia|habito)\b/.test(t)) return reply("process-goal", "Choose a realistic outcome goal and a controllable process goal, such as preparing for and following approved sessions, then review what helped or got in the way. Specific goals and feedback can support adherence, but they do not guarantee performance. A goal time is not a measured training reference, and missed sessions are not a debt.", "Elige una meta realista de resultado y una de proceso que puedas controlar, como prepararte para las sesiones aprobadas y seguirlas; después revisa qué ayudó y qué lo dificultó. Las metas concretas y la información de seguimiento pueden apoyar la constancia, pero no garantizan rendimiento. Un tiempo objetivo no es una referencia medida de entrenamiento y las sesiones perdidas no son una deuda.");
  const clarifications = conversationClarifications(message, { localToday: context.localToday });
  if (clarifications.length) return { answer: clarifications.join(" "), ruleId: "coach-conversation-v1:clarify-data" };
  if (extractLocalCandidates(message, { localToday: context.localToday }).length) return reply("review-proposals", "I found possible updates in what you shared. Review each value, date and session before confirming anything. Planned work stays separate from what you actually completed; nothing has been saved from this message alone.", "Encontré posibles actualizaciones en lo que compartiste. Revisa cada valor, fecha y sesión antes de confirmar. Lo planeado queda separado de lo realizado; este mensaje por sí solo no ha guardado ningún cambio.");
  return reply("ask-next-detail", "Tell me what you want to work on: your goal or available training time, how a session actually went, or what's making training difficult today. Include a date and units for any numbers. I can help you review the next step without inventing missing data.", "Cuéntame qué quieres trabajar: tu objetivo o tiempo disponible, cómo fue realmente una sesión, o qué dificulta entrenar hoy. Incluye fecha y unidades en los datos numéricos. Puedo ayudarte a revisar el siguiente paso sin inventar lo que falta.");
}
