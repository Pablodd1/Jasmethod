import { assertScreenshotSource, type ScreenshotSource } from "./ai-data-policy";
import { coachReferral } from "./coach-referrals";
import { commanderDraft } from "./coach-commander";
import { savedTrainingReply } from "./coach-saved-training";
import { endpointText } from "./universal-workout-card";
import { dayOffProtocol, dayOffProtocolText } from "./day-off";
import type { dailyRecoveryContext } from "./daily-recovery";
import type { JMetrics } from "./j-metrics";
import { resolveCheckinSafety, type CheckinSafetyInput } from "./checkin-safety";
import { isGeneralCoachEducationQuestion, localCoachEducation, wantsCoachDetail } from "./coach-conversation-education";
import { heightFromFeetInches } from "./units";

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
export interface ConversationInput { manualDialogueConsent?: boolean; messageOrigin?: "athlete_authored"; message: string; source: "text" | "voice"; externalConsent: boolean; aiReplyMemoryConsent?:boolean;textProviderConsent?: "openai"; imageConsent: boolean; imageProviderConsent?: "openai"; imageSource?: ScreenshotSource; image?: CoachImageInput }
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

const recentSessionQuestion = /\b(?:how (?:was|did) my (?:last|latest|recent) (?:workout|session|run)|what (?:was|did i do (?:in|for)) my (?:last|latest) (?:(?:recorded|reported) )?(?:workout|session)|my recent training|como (?:fue|me fue en) mi ultima (?:sesion|carrera)|mi entrenamiento reciente)\b/;

/** Query scope, not permission to train. Plain definitions need no saved
 * history; personal overviews retain the bounded, owner-only PR48 context. */
export function coachContextNeeds(message: string): { overview: boolean; history: "none" | "latest" | "overview"; load: boolean } {
  const text = normalize(message);
  // "Me" also occurs in ordinary requests such as "explain RPE to me".
  // Recognize explicit self-summary intent before the cheap education path,
  // rather than making every occurrence of that pronoun a personal-data read.
  const explicitSummary = /\b(?:what (?:do you know|can you (?:tell|say)) about me|tell me (?:what you know )?about me|que sabes (?:de|sobre) mi|(?:give me|show me|dame|muestrame) (?:a |an |un )?(?:personal (?:summary|overview|analysis)|resumen personal))\b/.test(text);
  if (!explicitSummary && isGeneralCoachEducationQuestion(message, wantsCoachDetail(message))) return { overview: false, history: "none", load: false };
  const latest = recentSessionQuestion.test(text);
  const personal = /\b(?:my|mine|me|mi|mis)\b/.test(text);
  const overview = explicitSummary || (personal && /\b(?:profile|about me|personal (?:summary|overview|analysis)|my (?:training|progress|performance)|training history|history|biometrics|readings|hrv|resting (?:hr|heart rate)|sleep|next race|upcoming race|my race|perfil|sobre mi|resumen personal|mi (?:entrenamiento|progreso|rendimiento)|mis entrenamientos|historial|datos|lecturas|vfc|sueno|proxima carrera|mi carrera|frecuencia cardiaca)\b/.test(text)
    && (!latest || /\b(?:profile|biometrics|readings|hrv|resting|sleep|next race|upcoming race|perfil|datos|lecturas|vfc|sueno|proxima carrera|frecuencia)\b/.test(text)));
  return {
    overview,
    history: overview ? "overview" : latest ? "latest" : "none",
    load: /\b(?:j ?metrics|jstress|j ?base|j ?recent|j ?balance)\b/.test(text),
  };
}

/** Envelope validation only; coach-image performs actual byte decoding server-side. */
export function parseConversationInput(raw: unknown): ConversationInput {
  if (!record(raw) || Object.keys(raw).some(k => !["message", "source", "externalConsent", "aiReplyMemoryConsent","textProviderConsent", "imageConsent", "imageProviderConsent", "imageSource", "image", "sessionId", "conversationId", "manualDialogueConsent", "messageOrigin"].includes(k))) throw Error("Invalid conversation input");
  if (typeof raw.message !== "string" || raw.message.length > 4000) throw Error("Message must be at most 4000 characters");
  const message = raw.message.trim();
  if (raw.source !== undefined && raw.source !== "text" && raw.source !== "voice") throw Error("Invalid input source");
  if (raw.externalConsent !== undefined && typeof raw.externalConsent !== "boolean") throw Error("Choose explicit external AI consent");
  if(raw.aiReplyMemoryConsent!==undefined&&typeof raw.aiReplyMemoryConsent!=='boolean')throw Error('Choose explicit AI reply memory consent');
  if (raw.imageConsent !== undefined && typeof raw.imageConsent !== "boolean") throw Error("Choose explicit image consent");
  if (raw.imageProviderConsent !== undefined && raw.imageProviderConsent !== "openai") throw Error("Invalid image provider consent");
  if (raw.textProviderConsent !== undefined && raw.textProviderConsent !== "openai") throw Error("Invalid text provider consent");
  if (raw.manualDialogueConsent !== undefined && typeof raw.manualDialogueConsent !== "boolean") throw Error("Choose explicit personal dialogue consent");
  if (raw.messageOrigin !== undefined && raw.messageOrigin !== "athlete_authored") throw Error("Only athlete-authored messages can use personal dialogue");
  if (raw.manualDialogueConsent === true && (raw.externalConsent !== true || raw.textProviderConsent !== "openai" || raw.messageOrigin !== "athlete_authored" || raw.image !== undefined)) throw Error("Personal dialogue requires named OpenAI consent, athlete-authored origin and no image");
  if (raw.image !== undefined) assertScreenshotSource(raw.imageSource);
  let image: CoachImageInput | undefined;
  if (raw.image !== undefined) {
    if (!record(raw.image) || Object.keys(raw.image).some(k => !["mimeType", "dataBase64"].includes(k)) || !imageTypes.includes(raw.image.mimeType as CoachImageInput["mimeType"]) || typeof raw.image.dataBase64 !== "string" || raw.image.dataBase64.length > Math.ceil(COACH_IMAGE_MAX_BYTES / 3) * 4 || (raw.image.dataBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.image.dataBase64)) || !raw.image.dataBase64.length) throw Error("Use PNG, JPEG or WebP bytes, up to 2 MB; URLs are not accepted");
    image = { mimeType: raw.image.mimeType as CoachImageInput["mimeType"], dataBase64: raw.image.dataBase64 };
  }
  if (!message && !image) throw Error("Add a message or image");
  return { ...(raw.manualDialogueConsent === true ? { manualDialogueConsent: true, messageOrigin: "athlete_authored" as const } : {}), message, source: raw.source === "voice" ? "voice" : "text", externalConsent: raw.externalConsent === true, imageConsent: raw.imageConsent === true,...(raw.aiReplyMemoryConsent===true?{aiReplyMemoryConsent:true}:{}), ...(raw.textProviderConsent === "openai" ? { textProviderConsent: "openai" as const } : {}), ...(raw.imageProviderConsent === "openai" ? { imageProviderConsent: "openai" as const } : {}), ...(image ? { image, imageSource: "manual_note" as const } : {}) };
}

type Rule = { unit: string | null; type: "number" | "boolean" | "string"; min?: number; max?: number; integer?: boolean; values?: readonly string[] };
const fieldRules: Record<CoachCandidate["kind"], Record<string, Rule>> = {
  profile: {
    goal: { type: "string", unit: null, values: COACH_GOALS },
    weeklyHours: { type: "number", unit: "h/week", min: 0.5, max: 40 },
    weightKg: { type: "number", unit: "kg", min: 20, max: 350 },
    heightCm: {type:"number",unit:"cm",min:80,max:250},
    birthYear: {type:"number",unit:"year",min:1900,max:new Date().getFullYear()-13,integer:true},
    experience: {type:"string",unit:null,values:["beginner","amateur","advanced","pro"]},
    ftp: {type:"number",unit:"W",min:20,max:700},
  },
  workout_feedback: {
    feedbackStatus: { type: "string", unit: null, values: ["completed", "partial", "substituted", "skipped"] },
    actualDurationMin: { type: "number", unit: "min", min: 0, max: 1440, integer: true },
    rpe: { type: "number", unit: "0-10", min: 0, max: 10, integer: true },
    actualSport: { type: "string", unit: null, values: COACH_SPORTS },
    avgHr: {type:'number',unit:'bpm',min:20,max:240,integer:true},
    avgPower: {type:'number',unit:'W',min:0,max:2500},
    calories: {type:'number',unit:'kcal',min:0,max:20000,integer:true},
    preWeightKg: {type:'number',unit:'kg',min:20,max:350},
    postWeightKg: {type:'number',unit:'kg',min:20,max:350},
  },
  workout_plan: { durationMin: { type: "number", unit: "min", min: 1, max: 1440, integer: true }, sport: { type: "string", unit: null, values: COACH_SPORTS }, intensity:{type:'string',unit:null,values:['z1','z2','z3','z4','z5','z6','z7']} },
  checkin: {
    ...Object.fromEntries(["sleep", "soreness", "motivation", "energy", "stress"].map(k => [k, { type: "number", unit: "1-5", min: 1, max: 5, integer: true } as Rule])),
    ...Object.fromEntries(["sick", "newPain", "urgentSymptoms", "painAffectsMovement"].map(k => [k, { type: "boolean", unit: null } as Rule])),
    availableMinutes: { type: "number", unit: "min", min: 0, max: 1440, integer: true },
    painLocation: { type: "string", unit: null },
  },
};
export const coachChangeFields = () => Object.fromEntries(['profile','workout_plan','workout_feedback'].map(kind=>[kind,fieldRules[kind as CoachCandidate['kind']]]));
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
  if(/\b(?:do not|don't|not|no|nunca)\s+(?:change|set|update|correct|make|shorten|reduce|extend|switch|log|record|save|cambies|cambiar|actualices|ajustes|guardes|registres)\b/.test(text))return [];
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
  if (!historicalProfile && /\b(?:my (?:goal|target)\s*(?:is(?!n't|\s+(?:not|no longer))\b|:)|(?:change|set|update|correct)\s+my\s+(?:goal|target)\s+(?:to|as)\b|i am training for|i'm training for|i want to (?:run|finish|complete)|mi (?:objetivo|meta)\s*(?:es\b(?!\s+no)|:)|(?:cambia|actualiza|ajusta)\s+mi\s+(?:objetivo|meta)\s+a\b|entreno para|quiero (?:correr|completar|terminar))/.test(text)) {
    const goals: [string, RegExp][] = [["half-marathon", /\b(half[ -]marathon|media maraton|medio maraton)\b/], ["marathon", /\b(marathon|maraton)\b/], ["10k", /\b10\s?k(?:m)?\b/], ["5k", /\b5\s?k(?:m)?\b/], ["olympic", /\b(olympic|olimpico|olimpica)\b/], ["sprint", /\bsprint triathlon\b|\btriatlon sprint\b/], ["half", /\b(70\.3|half ironman)\b/], ["full", /\b(full ironman|ironman completo|140\.6)\b/], ["hyrox", /\bhyrox\b/]];
    const found = goals.filter(([, pattern]) => pattern.test(text)).map(([goal]) => goal).filter(g => g !== "marathon" || !/\b(half[ -]marathon|media maraton|medio maraton)\b/.test(text));
    if (found.length === 1) add("profile", "goal", found[0], null, message);
  }
  const hours = unique(allNumbers(text, /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|horas?|h)\s*(?:per week|a week|weekly|\/week|por semana|a la semana|semanales)\b/g));
  if (!historicalProfile && !uncertainNumber && !/\b(?:can't|cannot|can not|could|no puedo|no tengo|no entreno|not available)\b/.test(text) && hours.length === 1 && /\b(i can|i have|i train|i am available|i'm available|my (?:weekly )?availability|(?:change|set|update|correct)\s+my\s+weekly hours|tengo|puedo|entreno|disponibilidad)\b/.test(text)) add("profile", "weeklyHours", hours[0], null, message);
  const weights = [...text.matchAll(/\b(?:i weigh|my weight is|(?:change|set|update|correct)\s+my\s+weight\s*(?:to|as|:)|weight\s*:|peso(?: actual)?\s*(?:es|:)?|mi peso es)\s*(\d+(?:[.,]\d+)?)\s*(kg|kilograms?|kilos?|lb|lbs|pounds?|libras?)\b/g)].map(m => ({ value: Number(m[1].replace(",", ".")) * (/^(lb|pound|libra)/.test(m[2]) ? 0.45359237 : 1), unit: m[2] }));
  if (!historicalProfile && !uncertainNumber && weights.length && unique(weights.map(w => w.value)).length === 1 && !/\b(goal weight|target weight|want to weigh|quiero pesar|peso objetivo|peso deseado)\b/.test(text) && !globalDate.ambiguous) add("profile", "weightKg", Math.round(weights[0].value * 100) / 100, globalDate.date, message, /^(lb|pound|libra)/.test(weights[0].unit) ? "Converted from explicitly reported pounds to kg; review the conversion." : undefined);
  if(!historicalProfile && !uncertainNumber && !globalDate.ambiguous) {
    const heights = [...text.matchAll(/\b(?:my height is|i am|height:|mi altura es|mido)\s*(\d+)\s*(?:ft|feet|foot|')\s*(\d+(?:[.,]\d+)?)\s*(?:inches|inch|in|")/g)]
      .filter(match => Number(match[2].replace(",", ".")) < 12)
      .map(match => heightFromFeetInches(Number(match[1]), Number(match[2].replace(",", "."))));
    if (heights.length && unique(heights).length === 1) add("profile", "heightCm", heights[0], globalDate.date, message);
    for(const [field,pattern] of [
      ["heightCm",/\b(?:my height is|i am|height:|mi altura es|mido)\s*(\d+(?:[.,]\d+)?)\s*cm\b/g],
      ["birthYear",/\b(?:my birth year is|i was born in|ano de nacimiento:|naci en)\s*(\d{4})\b/g],
      ["ftp",/\b(?:my ftp is|my ftp:|(?:change|set|update|correct)\s+my\s+ftp\s*(?:to|as|:)|mi ftp es|mi ftp:)\s*(\d+(?:[.,]\d+)?)\s*(?:w|watts?|vatios?)\b/g],
    ] as const) {
      const values=unique(allNumbers(text,pattern));
      if(values.length===1) add("profile",field,values[0],globalDate.date,message,field==="ftp"?"Athlete-reported reference only. A dated, reviewed benchmark test is required before treating this as an applied training anchor.":undefined);
    }
    const experience=/\b(?:my experience is|my level is|mi experiencia es|mi nivel es)\s*(beginner|amateur|intermediate|advanced|pro|principiante|intermedio|avanzado|profesional)\b/.exec(text)?.[1];
    if(experience) add("profile","experience",({intermediate:"amateur",principiante:"beginner",intermedio:"amateur",avanzado:"advanced",profesional:"pro"} as Record<string,string>)[experience]??experience,null,message);
  }
  const clauses = message.split(/\n|;|(?<=[.!?])\s+|\b(?:but|pero)\b/i).filter(Boolean);
  for (const clause of clauses) {
    const t = normalize(clause);
    if (/\b(?:reading|researching|watching|video|book|article|leer|leyendo|investigar|investigando|viendo|libro|articulo)\b/.test(t)) continue;
    if (/\b(?:not|never|didn't|did not|no|nunca)\s+(?:run|ran|complete|completed|finish|finished|plan|planned|planning|swim|swam|ride|rode|correr|corri|complete|termine|planifique|planeo)\b/.test(t)) continue;
    const ownDate = dateIn(t, context.localToday);
    if (ownDate.ambiguous) continue;
    const date = ownDate.date || (!globalDate.ambiguous ? globalDate.date || (isCoachDate(context.sessionDate) ? context.sessionDate : null) : null);
    const explicitEdit = !!context.sessionId && /\b(?:change|set|update|correct|switch|shorten|reduce|extend|make|cambia|cambiar|actualiza|ajusta|ajustar|reduce|amplia)\b/.test(t) && /\b(?:(?:my|selected|this|today's|todays|tomorrow's|mi|seleccionad[oa]|esta|este)\s+(?:workout|session|training|run|ride|swim|entrenamiento|sesion)|it)\b/.test(t);
    const planned = explicitEdit || /\b(plan(?:ned)? to|planning to|will|going to|want to|schedule|planned|planeo|planifique|voy a|quiero|programado|planificado)\b/.test(t);
    const explicitCompletion = /\b(completed|finished|complete|termine)\b/.test(t);
    const completed = explicitCompletion || /\b(?:i (?:ran|swam|rode|cycled|biked|jogged)|corri|nade|pedalee)\b/.test(t) || /\b(?:i did|hice|realice)\s+(?:(?:a|an|my|mi|una?|the)\s+)?(?:run|swim|ride|workout|session|carrera|sesion|entrenamiento)\b/.test(t);
    const skipped = /\b(skipped|missed|me salte|omiti|no hice)\b/.test(t);
    const partial = /\b(partial|partially|only completed|stopped early|parcial|parcialmente|solo complete|pare antes)\b/.test(t);
    if (!date || (planned && (completed || skipped))) continue;
    const sports = sportsIn(t);
    if (sports.length > 1) continue;
    const minuteMatches = allNumbers(t, /\b(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?|minutos?)\b/g);
    const hourMatches = allNumbers(t, /\b(\d+(?:[.,]\d+)?)\s*(?:hours?|horas?)\b(?!\s*(?:per week|a week|weekly|por semana|a la semana|semanales))/g).map(n => n * 60);
    // Preserve the reviewed conversational duration edit without exporting the
    // athlete's request to a model. Only this exact, unambiguous unit is mapped.
    const halfHour = explicitEdit && /\b(?:half an? hour|media hora)[.!?\s]*$/.test(t)
      && !/\b(?:not|no|around|about|approximately|more than|less than|aproximadamente)\s+(?:half an? hour|media hora)\b/.test(t) ? [30] : [];
    const durations = unique([...minuteMatches, ...hourMatches, ...halfHour]);
    if (durations.length > 1 || /\b\d+\s*(?:-|to|a|or|o)\s*\d+\s*(?:min|hour|hora)/.test(t)) continue;
    const kind = planned ? "workout_plan" : "workout_feedback";
    if (!planned && !completed && !skipped && !partial) continue;
    if (skipped) { if (!durations.length && !/\brpe\b/.test(t)) add(kind, "feedbackStatus", "skipped", date, clause); continue; }
    if (!planned && (explicitCompletion || partial)) add(kind, "feedbackStatus", partial ? "partial" : "completed", date, clause);
    if (durations.length === 1) add(kind, planned ? "durationMin" : "actualDurationMin", durations[0], date, clause);
    if (sports.length === 1) add(kind, planned ? "sport" : "actualSport", sports[0], date, clause);
    if(explicitEdit) {
      const zones=unique([...t.matchAll(/\b(?:z|zone|zona)\s*([1-7])\b/g)].map(m=>`z${m[1]}`));
      if(zones.length===1)add('workout_plan','intensity',zones[0],date,clause,'A requested effort label is not a new measured threshold. Review the rebuilt workout before execution.');
    }
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
  // Logging needs exact dates and units. Ordinary questions and hypothetical
  // examples do not: never turn every conversation into a data-entry interview.
  const explicitLogging = /\b(?:log|record|save|register|registra|registrar|guarda|guardar)\b/.test(t);
  if (!explicitLogging && (/[?¿]/.test(t) || /\b(?:what|why|how|should|could|would|can i|tell me|explain|que|como|deberia|puedo)\b/.test(t))) return [];
  const logging = explicitLogging
    || /\b(?:i (?:ran|swam|rode|cycled|biked|jogged|completed|finished|skipped|missed|weigh)|my weight is|my (?:goal|target) is|my (?:weekly )?availability|i can train|corri|nade|pedalee|complete|termine|me salte|mi peso|mi objetivo|mi meta|puedo entrenar)\b/.test(t)
    || /\b(?:i (?:plan|am planning|will|am going) to|i'm (?:planning|going) to|planeo|voy a)\b/.test(t);
  if (!logging) return [];
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
  externalFacts?: import("./coach-personal-context").PersonalCoachFacts;
  savedTodaySessions?: { date: string; title: string; sport: string; durationMin: number; completed: boolean }[];
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
  recentMessages?: { role: "user" | "assistant"; content: string; createdAt?: string;source?:string;externalContextVersion?:string }[];
  candidateContext?: Pick<CandidateContext, "sessionId" | "sessionDate">;
  profile?: { goal?: string | null; experience?: string | null; weeklyHours?: number | null; weightKg?: number | null } | null;
  athleteOverview?: {
    historyDays: number;
    metrics: { date: string; source: string | null; hrv: number | null; hrvType: string | null; restingHr: number | null; sleepHours: number | null } | null;
    race: { name: string; date: string; distance: string | null } | null;
  };
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
  const swimReview=/\b(?:swim|swimming|natacion|nado)\b/.test(t)&&/\b(?:review|evaluate|assess|revisa|revisar|analiza|analizar)\b/.test(t);
  const swimDuration=/(\d{1,4})[ -]*(?:minutes?|mins?|minutos?|min)[ -]+(?:swim|swimming|natacion|nado)\b/.exec(t)??/\b(?:swim|swimming|natacion|nado)[^.!?\n]{0,30}?\b(\d{1,4})\s*(?:minutes?|mins?|minutos?|min)\b/.exec(t);
  if(swimReview||(swimDuration&&Number(swimDuration[1])>75))return reply("specific-training-review",
    `This reply uses the local rules assistant, without an external AI model. I cannot prescribe a personalized VO₂max session or infer a VO₂max pace from a threshold value. Review a structured protocol preview and current, dated sport references with your coach before saving it. ${swimDuration?`Your reported ${Number(swimDuration[1])}-minute swim`:'The swim session'} needs review of actual swim history, pool/open-water context, repetitions, rests and duration; the daily time limit alone does not establish suitability. No workout has been changed.`,
    `Esta respuesta usa reglas locales, no IA externa. No puedo prescribir una sesión personalizada de VO₂max ni deducir su ritmo de un umbral. Revisa un protocolo estructurado y referencias deportivas actuales y fechadas con tu entrenador antes de guardarlo. ${swimDuration?`La natación declarada de ${Number(swimDuration[1])} minutos`:'La sesión de natación'} necesita revisar historial real, piscina/aguas abiertas, repeticiones, descansos y duración; el límite diario no establece idoneidad. No se ha cambiado ninguna sesión.`);

  const command=commanderDraft(message);
  if(command?.area==="plan"&&/\b(?:plan|cycle|ciclo)\b/i.test(message)&&/\b(?:build|create|generate|revise|replace|change|want|make|crea|genera|cambia|quiero|prepara)\b/i.test(message)) return reply("plan-workspace",
    "We can review a complete cycle here. First review and confirm any proposed profile facts, then open Plan preview in Review and act here. Check the start date, planning horizon, saved availability and every proposed session. Nothing is saved until you confirm the exact current preview. Missing evidence or event conflicts remain visible, and daily check-in holds still apply.",
    "Podemos revisar un ciclo completo aquí. Primero revisa y confirma los datos de perfil propuestos; después abre Vista previa del plan en Revisar y actuar aquí. Comprueba la fecha, semanas, disponibilidad guardada y cada sesión. No se guarda nada hasta confirmar la vista previa actual. Los datos ausentes, conflictos de eventos y bloqueos diarios se mantienen visibles.");
  const detail = wantsCoachDetail(message);
  const followupDetail = detail && /^(?:tell me more|more details?|elaborate|expand|explain more|go (?:deeper|on)|mas detalles?|explica mas|amplia|profundiza)[.!?\s]*$/.test(t.trim());
  const previousTopic = [...priorMessages].reverse().find(entry => !wantsCoachDetail(entry.content))?.content ?? "";
  const overviewRequested = coachContextNeeds(message).overview;
  const educational = !overviewRequested && (localCoachEducation(message, es ? "es" : "en", detail)
    || (followupDetail
      ? localCoachEducation(previousTopic, es ? "es" : "en", true) : null));
  if (educational) return { answer: educational.answer, ruleId: `coach-conversation-v1:education-${educational.topic}` };
  const vo2 = /\b(?:v[ -]?o[₂2][ -]?max|vo2|oxygen uptake|consumo maximo de oxigeno)\b/i;
  const vo2Context = vo2.test(t) ? t : followupDetail ? normalize(previousTopic) : "";
  if (!overviewRequested && isGeneralCoachEducationQuestion(vo2Context, detail) && vo2.test(vo2Context) && /\b(?:what (?:is|does)|define|explain|que (?:es|significa)|explica)\b/.test(vo2Context) && !/\b(?:session|workout|track|sesion|entrenamiento|pista)\b/.test(vo2Context)) return reply("education-vo2",
    `VO₂max is the maximum rate at which your body can use oxygen during intense exercise. It describes aerobic capacity; it does not by itself give your training pace or predict a race result.${detail ? "\n\nIt reflects oxygen delivery and use across the cardiovascular and muscular systems. Relative values are usually expressed in mL/kg/min. A device estimate is different from a laboratory measurement; changes in the estimate alone do not establish a change in fitness or readiness. Training decisions also need current performance references and recovery context." : ""}`,
    `El VO₂max es la tasa máxima a la que tu cuerpo puede utilizar oxígeno durante ejercicio intenso. Describe la capacidad aeróbica; por sí solo no determina tu ritmo de entrenamiento ni predice un resultado de carrera.${detail ? "\n\nRefleja el transporte y uso de oxígeno en los sistemas cardiovascular y muscular. Los valores relativos suelen expresarse en mL/kg/min. Una estimación del dispositivo es distinta de una medición de laboratorio; sus cambios por sí solos no demuestran un cambio de forma física o disposición. Las decisiones de entrenamiento también necesitan referencias actuales de rendimiento y contexto de recuperación." : ""}`);
  // General explanations above do not authorize exercise or resolve a concern.
  if (pendingSafety) return reply("clarify-prior-safety", "You shared new safety, recovery or available-time information. Before discussing a training start, does that information still apply, and has today's check-in been updated since then? An earlier check-in does not resolve newer information.", "Compartiste información nueva de seguridad, recuperación o tiempo disponible. Antes de hablar de empezar a entrenar, ¿sigue siendo válida y has actualizado el check-in de hoy desde entonces? Un check-in anterior no resuelve información posterior.");
  const referral=coachReferral(message,context.language);
  if(referral) return referral;
  if(/\b(?:push me|challenge me|motivate me|always (?:have|get) results|help me improve|quiero mejorar|motivame|exigeme|desafiame)\b/.test(t))return reply('purposeful-progression',
    "I will challenge you to train with purpose and consistency: understand the session goal, execute the reviewed work with control, and report what actually happened. If the barrier is motivation, we can work on starting the already-approved warm-up; if it is fatigue, illness or pain, we reassess instead of pushing through. Progression follows your recent tolerated training, actual effort and recovery, not a fixed percentage or a demand to fill every available hour. Tell me whether today's obstacle is time, motivation or physical recovery. We can then review a concrete next step; any plan change still needs your confirmation. Improvement is judged over time and cannot be guaranteed every day.",
    "Te exigiré propósito y constancia: entiende el objetivo, realiza el trabajo revisado con control e informa lo que hiciste. Si falta motivación, podemos trabajar en empezar el calentamiento ya aprobado; si hay fatiga, enfermedad o dolor, reevaluamos en lugar de forzar. La progresión depende del entrenamiento tolerado, esfuerzo real y recuperación, no de un porcentaje fijo ni de llenar cada hora disponible. ¿El obstáculo de hoy es tiempo, motivación o recuperación física? Revisaremos un paso concreto; los cambios requieren tu confirmación. La mejora se evalúa con el tiempo y no se garantiza cada día.",['loadMonitoring','subjectiveResponse','autonomousMotivation']);
  const savedTraining = savedTrainingReply(message, context);
  if (savedTraining) return savedTraining;
  if(!context.candidateContext?.sessionId && /\b(?:change|set|update|correct|switch|shorten|reduce|extend|cambia|cambiar|actualiza|ajusta|ajustar)\b/.test(t) && /\b(?:my|this|mi|esta|este)\s+(?:workout|session|training|entrenamiento|sesion)\b/.test(t)) return reply("select-workout-to-edit","Choose the workout in Optional tools, then tell me the change and units. I will show the proposed values for confirmation. Completed sessions, rest days and race/test sessions cannot be rewritten here.","Elige la sesión en Herramientas opcionales y dime el cambio con sus unidades. Mostraré los valores para confirmar. Aquí no se reescriben sesiones realizadas, descansos ni carreras/pruebas.");
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
  if (context.athleteOverview && overviewRequested) {
    const overview = context.athleteOverview, metric = overview.metrics, race = overview.race;
    const reports = (context.recentFeedback ?? []).filter(row => isCoachDate(row.date) && row.date <= context.localToday);
    const known = reports.filter(row => typeof row.actualDurationMin === "number" && Number.isFinite(row.actualDurationMin) && row.actualDurationMin >= 0);
    const minutes = known.reduce((sum, row) => sum + row.actualDurationMin!, 0);
    return reply("athlete-context-summary",
      `Your saved sport/goal: ${context.profile?.goal??"unknown"}; experience: ${context.profile?.experience??"unknown"}. In the last ${overview.historyDays} days, ${known.length}/${reports.length} returned session reports have recorded actual minutes (${minutes} min total; incomplete when reports are missing). ${metric?`Latest readings (${metric.date}, ${metric.source??"unknown source"}): sleep ${metric.sleepHours??"unknown"} h, resting HR ${metric.restingHr??"unknown"} bpm, HRV ${metric.hrv??"unknown"} ms (${metric.hrvType??"unknown method"}).`:"No recent biometric readings are available."} ${race?`Upcoming saved race: ${race.name}, ${race.date}, ${race.distance??"distance unknown"}. A race prediction needs comparable performance and venue evidence; these readings alone do not predict a finish time.`:"No upcoming race is saved."} Review today's check-in and record session outcomes to inform daily coaching. Change persistent details in /profile; chat does not silently change your training or invent a benchmark.`,
      `Deporte/objetivo guardado: ${context.profile?.goal??"desconocido"}; experiencia: ${context.profile?.experience??"desconocida"}. En ${overview.historyDays} días, ${known.length}/${reports.length} informes devueltos tienen minutos reales (${minutes} min; incompleto si faltan informes). ${metric?`Últimas lecturas (${metric.date}, ${metric.source??"fuente desconocida"}): sueño ${metric.sleepHours??"desconocido"} h, FC en reposo ${metric.restingHr??"desconocida"} lpm, VFC ${metric.hrv??"desconocida"} ms (${metric.hrvType??"método desconocido"}).`:"No hay biometría reciente disponible."} ${race?`Próxima carrera guardada: ${race.name}, ${race.date}, ${race.distance??"distancia desconocida"}. Un pronóstico necesita rendimiento comparable y datos del recorrido; estas lecturas no predicen un tiempo final.`:"No hay carrera próxima guardada."} Revisa el chequeo de hoy y registra resultados reales. Cambia los datos permanentes en /profile; el chat no cambia el entrenamiento ni inventa referencias.`);
  }
  const profileUpdates = extractLocalCandidates(message, { localToday: context.localToday, ...context.candidateContext }).filter(candidate => candidate.kind === "profile");
  if (profileUpdates.length) {
    const availability = profileUpdates.find(candidate => candidate.field === "weeklyHours");
    const schedulePreference = /\b(?:days? off|rest days?|every day|seven days|dias? (?:libres?|de descanso)|todos los dias)\b/.test(t);
    return reply("review-proposals",
      `${availability ? `Your reported weekly availability is ${availability.value} hours. ` : ""}Review and confirm the profile values proposed below; nothing has been saved.${schedulePreference ? " Rest-day preferences and recurring weekday assignments still need the Profile/planning setup editor or a reviewed human-coach handoff. Confirming weekly hours does not change those settings or prescribe training every day." : ""}`,
      `${availability ? `Tu disponibilidad semanal reportada es de ${availability.value} horas. ` : ""}Revisa y confirma los datos de perfil propuestos abajo; todavía no se ha guardado nada.${schedulePreference ? " Las preferencias de descanso y los días fijos siguen en el editor de Perfil/configuración del plan o en una revisión con entrenador humano. Confirmar las horas semanales no cambia esos ajustes ni prescribe entrenar todos los días." : ""}`);
  }
  if (/\b(?:no (?:days? off|rest days?)|every day|seven days|sin dias? (?:libres?|de descanso)|todos los dias)\b/.test(t)) return reply('schedule-preference',
    "I understand this as a weekly schedule preference, not a request for a rest-day guide. Being available every day does not mean every day should be hard; recovery can still be planned. Weekly availability can be proposed below when stated clearly. Rest-day preferences, recurring weekday assignments and full-cycle changes still need the Profile/planning setup editor; I have not changed those settings. Tell me which supported workout or profile value you want to review, or use the human-coach option for the wider schedule.",
    "Entiendo que describes una preferencia de horario semanal, no que pides una guía de descanso. Estar disponible todos los días no significa entrenar fuerte cada día; se puede planificar recuperación. Las horas semanales pueden proponerse abajo si las indicas claramente. Las preferencias de descanso, días fijos y cambios del ciclo completo siguen en Perfil/configuración del plan; no he cambiado esos ajustes. Indica qué sesión o dato quieres revisar, o consulta al entrenador humano para el horario completo.");
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

  const timeFollowup = /^(?:i (?:only )?have|i can spare|tengo|dispongo de)\s+(?:\d+(?:[.,]\d+)?|one|an?|una?)\s*(?:hours?|horas?|h|minutes?|minutos?|mins?)(?:\s+(?:available|to train|for training|disponibles|para entrenar))?[.!?\s]*$/;
  const vo2Workout = (text: string) => vo2.test(text) && /\b(?:train|training|workout|session|track|develop|improve|increase|entrenar|entrenamiento|sesion|pista|trabajar|desarrollar|mejorar|aumentar)\b/.test(text);
  const vo2Topic = vo2Workout(t) || ((timeFollowup.test(t) || detail) && vo2Workout(normalize(previousTopic)));
  if (vo2Topic) {
    if (context.recovery?.mode === "planned-rest") return reply("preserve-rest-day", "Today is a planned recovery/rest day. Keep the hard track session for a separate plan review; do not replace rest with intervals or add catch-up work.", "Hoy hay descanso o recuperación planificados. Deja la sesión intensa de pista para una revisión aparte del plan; no sustituyas el descanso por intervalos ni añadas trabajo pendiente.");
    if (context.recovery?.mode === "hold") return reply("recovery-hold-guide", "Training is on hold. Review the restriction with your coach or an appropriate professional before considering intervals; this chat does not clear you to train.", "El entrenamiento está en pausa. Revisa la restricción con tu entrenador o un profesional adecuado antes de considerar intervalos; este chat no autoriza entrenar.");
    const minutes = t.match(/\b(\d+(?:[.,]\d+)?)\s*(minutes?|mins?|minutos?)\b/);
    const hours = t.match(/\b(\d+(?:[.,]\d+)?|one|an?|una?)\s*(hours?|horas?)\b/);
    const limit = minutes ? Number(minutes[1].replace(",", ".")) : hours ? (/^\d/.test(hours[1]) ? Number(hours[1].replace(",", ".")) : 1) * 60 : null;
    if (limit !== null && limit < 50) return reply("vo2-time-limit", `The 4 × 4-minute VO₂max example needs about 50 minutes including a full warm-up, recoveries and cool-down. With ${limit} minutes available, don't squeeze the same hard work into less time or cut the preparation. Keep today's approved session within your time limit; a shorter interval session needs a separate plan review.`, `El ejemplo de VO₂max de 4 × 4 minutos necesita unos 50 minutos, con calentamiento, recuperaciones y vuelta a la calma. Con ${limit} minutos disponibles, no comprimas el mismo trabajo intenso ni recortes la preparación. Mantén la sesión aprobada de hoy dentro de tu tiempo disponible; una sesión de intervalos más corta necesita una revisión aparte.`);
    const example = "General track example for review, for a runner already accustomed to intervals whose current plan and safety check-in permit hard training:\n• 15 min easy warm-up\n• 4 × 4 min hard but controlled running, with 3 min easy jogging between repetitions (3 recoveries)\n• 10 min easy cool-down\nTotal: 50 min. Run repeatable efforts, not sprints; stop for pain, dizziness or unusual breathlessness. Your pace must come from current running references, not an invented VO₂max target. This is an example, not a saved or approved session.";
    const exampleEs = "Ejemplo general de pista para revisar, para alguien habituado a los intervalos cuyo plan y check-in de seguridad permitan trabajo intenso:\n• 15 min de calentamiento suave\n• 4 × 4 min de carrera intensa pero controlada, con 3 min de trote suave entre repeticiones (3 recuperaciones)\n• 10 min de vuelta a la calma suave\nTotal: 50 min. Mantén esfuerzos repetibles, sin esprintar; detente ante dolor, mareo o falta de aire inusual. El ritmo debe partir de referencias actuales de carrera, no de un objetivo de VO₂max inventado. Es un ejemplo, no una sesión guardada ni aprobada.";
    return reply("vo2-track-example", `${example}${detail ? "\n\nThe repeated work periods accumulate demanding aerobic running while the easy recoveries help keep the later repetitions controlled. If the early reps make the remaining ones unsustainable, the effort is too high for this example. Do not add this on top of another hard workout or replace a planned recovery day. Method: https://www.ntnu.edu/cerg/advice" : ""}`, `${exampleEs}${detail ? "\n\nLas repeticiones acumulan carrera aeróbica exigente y las recuperaciones suaves ayudan a mantener el control en las últimas. Si las primeras hacen imposible sostener las restantes, el esfuerzo es demasiado alto para este ejemplo. No lo añadas a otro entrenamiento intenso ni sustituyas un descanso planificado. Método: https://www.ntnu.edu/cerg/advice" : ""}`, ["ntnu-cerg-4x4"]);
  }
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
    return reply("support-planned-start", `${basis}${purpose}If this is low motivation rather than illness, pain or physical fatigue, I recommend starting only ${first}, then reassessing how you feel. Keep the existing limits; stop for symptoms. You can choose to continue within the plan or stop.`, `${basisEs}${purposeEs}Si es poca motivación y no enfermedad, dolor o fatiga física, te recomiendo empezar solo ${firstEs} y después valorar cómo te sientes. Mantén los límites existentes y detente si aparecen síntomas. Puedes seguir dentro del plan o parar.`);
  }
  if (avoidance) return reply("clarify-barrier", "What's behind wanting to skip: time, low motivation, physical fatigue, illness or pain? A small planned start can help with reluctance, but I need today's safety check-in and an approved session before recommending activity. Your decision remains yours; there is no catch-up requirement.", "¿Qué hay detrás de querer saltártelo: tiempo, poca motivación, fatiga física, enfermedad o dolor? Un inicio pequeño y planificado puede ayudar con la resistencia a empezar, pero necesito el check-in de hoy y una sesión aprobada antes de recomendar actividad. Tú decides y no hay obligación de compensar.");
  if (/\b(?:what (?:is|are) my (?:weekly (?:hours|availability)|available (?:time|hours))|how (?:many hours|much time) (?:do i have|can i train)|cual es mi disponibilidad|cuantas horas tengo)\b/.test(t)) {
    const hours = context.profile?.weeklyHours;
    if (typeof hours === "number" && Number.isFinite(hours) && hours >= 0.5 && hours <= 40) return reply("remember-confirmed-availability", `Your saved weekly availability is ${hours} hours. This is a scheduling limit, not a requirement to fill every hour or make up missed training.`, `Tu disponibilidad semanal guardada es de ${hours} horas. Es un límite de agenda, no una obligación de completar todas las horas ni compensar entrenamientos perdidos.`);
    return reply("missing-confirmed-availability", "I don't have confirmed weekly availability in this context. Weekly volume is calculated from recent tolerated training, available days and recovery. You can add or change those details in /profile; weekly hours are optional.", "No tengo una disponibilidad semanal confirmada en este contexto. El volumen se calcula según entrenamiento reciente tolerado, días disponibles y recuperación. Puedes cambiar esos datos en /profile; las horas semanales son opcionales.");
  }
  if (recentSessionQuestion.test(t)) {
    const latest = (context.recentFeedback || []).filter(f => isCoachDate(f.date) && f.date <= context.localToday).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) return reply("missing-reported-history", "I don't have a confirmed recent session report in this context. Tell me the session date, actual outcome, minutes and overall RPE; planned minutes are not proof of what happened.", "No tengo un informe confirmado de una sesión reciente en este contexto. Dime fecha, resultado real, minutos y RPE global; los minutos previstos no demuestran lo realizado.");
    const outcome = ["completed", "partial", "substituted", "skipped"].includes(latest.feedbackStatus || "") ? latest.feedbackStatus : null;
    const minutes = typeof latest.actualDurationMin === "number" && Number.isFinite(latest.actualDurationMin) && latest.actualDurationMin >= 0 && latest.actualDurationMin <= 1440 ? latest.actualDurationMin : null;
    const rpe = typeof latest.rpe === "number" && Number.isInteger(latest.rpe) && latest.rpe >= 0 && latest.rpe <= 10 ? latest.rpe : null;
    return reply("remember-reported-history", `Your latest reported session is dated ${latest.date}: outcome ${outcome || "unknown"}, actual duration ${minutes === null ? "unknown" : endpointText({ endpoint: { type: "time", seconds: minutes * 60 } })}, overall RPE ${rpe === null ? "unknown" : `${rpe}/10`}. These are reported facts, not proof of readiness today; no missing values are filled from the plan.`, `Tu última sesión informada tiene fecha ${latest.date}: resultado ${outcome || "desconocido"}, duración real ${minutes === null ? "desconocida" : endpointText({ endpoint: { type: "time", seconds: minutes * 60 } }, "es")}, RPE global ${rpe === null ? "desconocido" : `${rpe}/10`}. Son datos informados, no prueba de disposición para hoy; no se completan datos ausentes con el plan.`);
  }
  if (/\b(what (?:was|is) my goal|remind me (?:of )?my goal|cual (?:era|es) mi (?:meta|objetivo))\b/.test(t)) {
    const goal = context.profile?.goal;
    if (goal && COACH_GOALS.includes(goal as typeof COACH_GOALS[number])) return reply("remember-confirmed-goal", `Your saved goal is ${goal}. We can choose a controllable next step within your approved plan; the goal itself does not establish training pace or readiness.`, `Tu objetivo guardado es ${goal}. Podemos elegir un siguiente paso controlable dentro del plan aprobado; el objetivo no establece tu ritmo ni tu disposición para entrenar.`);
    const mentioned = prior.flatMap(p => extractLocalCandidates(p, { localToday: context.localToday })).filter(c => c.kind === "profile" && c.field === "goal").at(-1);
    if (mentioned) return reply("remember-proposed-goal", `You mentioned ${mentioned.value} in this conversation. That was a proposed goal; I cannot assume it was saved. Review the goal before planning around it.`, `Mencionaste ${mentioned.value} en esta conversación. Era una propuesta de objetivo; no puedo asumir que se guardó. Revísalo antes de planificar en torno a él.`);
  }
  const candidateContext = { localToday: context.localToday, ...context.candidateContext };
  if(!candidateContext.sessionId&&/\b(?:change|set|update|correct|make|shorten|reduce|extend|switch|cambia|actualiza|ajusta)\b/.test(t)&&/\b(?:workout|session|training|run|ride|swim|entrenamiento|sesion)\b/.test(t))return reply('choose-workout','Which workout should I change? Choose its date and title in the workout selector above, then send the requested change. I will show the exact proposal before you confirm it.','¿Qué sesión quieres cambiar? Elige su fecha y título en el selector de arriba y envía el cambio. Te mostraré la propuesta exacta antes de que la confirmes.');
  const clarifications = conversationClarifications(message, candidateContext);
  if (clarifications.length) return { answer: clarifications.join(" "), ruleId: "coach-conversation-v1:clarify-data" };
  if (extractLocalCandidates(message, candidateContext).length) return reply("review-proposals", "I found possible updates in what you shared. Review each value, date and session before confirming anything. Planned work stays separate from what you actually completed; nothing has been saved from this message alone.", "Encontré posibles actualizaciones en lo que compartiste. Revisa cada valor, fecha y sesión antes de confirmar. Lo planeado queda separado de lo realizado; este mensaje por sí solo no ha guardado ningún cambio.");
  if (/\b(goal|target|motivation|consistent|consistency|habit|objetivo|meta|motivacion|constancia|habito)\b/.test(t)) return reply("process-goal", "Choose a realistic outcome goal and a controllable process goal, such as preparing for and following approved sessions, then review what helped or got in the way. Specific goals and feedback can support adherence, but they do not guarantee performance. A goal time is not a measured training reference, and missed sessions are not a debt.", "Elige una meta realista de resultado y una de proceso que puedas controlar, como prepararte para las sesiones aprobadas y seguirlas; después revisa qué ayudó y qué lo dificultó. Las metas concretas y la información de seguimiento pueden apoyar la constancia, pero no garantizan rendimiento. Un tiempo objetivo no es una referencia medida de entrenamiento y las sesiones perdidas no son una deuda.");
  if (/^(?:hi|hello|hey|hola|buenas)[!.\s]*$/.test(t)) return reply("greeting", "Hi! I’m here to help with your training.", "¡Hola! Estoy aquí para ayudarte con tu entrenamiento.");
  if (/^(?:thanks|thank you|ok|okay|gracias|vale)[!.\s]*$/.test(t)) return reply("acknowledgment", "You’re welcome.", "De nada.");
  return reply("ask-next-detail", "I don't have a reliable answer for that specific question in local mode. I can explain training concepts such as RPE, endurance, VO₂max and periodization, or summarize confirmed facts from your profile and sessions.", "No tengo una respuesta fiable para esa pregunta concreta en el modo local. Puedo explicar conceptos como RPE, resistencia, VO₂max y periodización, o resumir datos confirmados de tu perfil y tus sesiones.");
}
