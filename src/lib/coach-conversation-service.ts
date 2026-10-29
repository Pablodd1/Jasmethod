import { AI_DATA_POLICY_VERSION, historySafeLocalReply } from "./ai-data-policy";
import {ACTIVITY_EVIDENCE_SELECT} from "./activity-evidence";
import { readActivityDecisions } from "./activity-reconciliation";
import { dailyRecoveryContext } from "./daily-recovery";
import { computeJMetrics } from "./j-metrics";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma, CoachConversationProposal } from "@prisma/client";
import { prisma } from "./db";
import { ApiError, trainingAccess } from "./access";
import { dateKey, dayBounds, localDate, addDaysKey } from "./dates";
import { profileRevision, saveProfile } from "./profile-service";
import { unitsOf } from "./units";
import { updateWorkout, workoutRevision } from "./workout-update";
import { readPlanningSetup } from "./planning-setup-store";
import { assessPlanningSetup } from "./planning-setup";
import { effectivePrescription } from "./effective-prescription";
import { parseConversationInput, extractLocalCandidates, validateCoachCandidates, buildCoachReply, coachContextNeeds, conversationClarifications, type CoachCandidate, type CoachReplyContext } from "./coach-conversation";
import { extractImageCandidates } from "./coach-image";
import { coachTextAnswer, coachTextConfigured } from "./coach-text-provider";
import { coachVisionConfiguration, createCoachVisionProvider } from "./coach-vision-provider";
import { coachAutoSessionDay,coachPlanChangeWarnings } from './coach-intent';
import { currentOrReportedWorkoutWhere } from './calendar-workouts';

export type ConversationActor = { id: string; timezone: string; language?: string };
type DB = Prisma.TransactionClient;
export const CONVERSATION_MESSAGE_LIMIT = 60;
function coachCapabilities() { const externalAi = coachTextConfigured(), imageUnderstanding = coachVisionConfiguration().configured; return { externalAi, textProvider: externalAi ? "OpenAI" : null, imageUnderstanding, imageProvider: imageUnderstanding ? "OpenAI" : null }; }
const SAFETY_RULES = ["urgent-symptoms", "illness-or-pain", "clarify-fatigue", "clarify-prior-safety", "clarify-symptom-timing", "clarify-current-symptoms", "unreviewed-image-urgent", "unreviewed-image-symptoms"];
const mutationFields: Record<string, readonly string[]> = {
  profile: ["goal", "weeklyHours", "weightKg", "heightCm", "birthYear", "experience", "ftp"],
  workout_feedback: ["feedbackStatus", "actualDurationMin", "rpe", "actualSport",'avgHr','avgPower','calories','preWeightKg','postWeightKg'],
  workout_plan:["durationMin","sport","intensity"],
};
export type PendingAction = "review_checkin" | "review_plan";
export interface ConversationReceipt {
  id: string;
  proposalId: string;
  confirmedAt: string;
  applied: Array<{ candidateId: string; kind: string; field: string; value: CoachCandidate["value"]; previousValue?: CoachCandidate["value"]; sourceValue: CoachCandidate["value"]; source: string; observedDate: string | null; sessionId?: string; entityId: string; evidence: string }>;
  pendingActions: PendingAction[];
  checkinDraft: CoachCandidate[];
  planDraft: CoachCandidate[];
  message: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Expected an object");
  return value as Record<string, unknown>;
}
function parsed<T>(value: string, label: string): T {
  try { return JSON.parse(value) as T; } catch { throw new ApiError(`Stored ${label} cannot be verified. Start a new message.`, 409); }
}
function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new ApiError(`Invalid ${label}`);
  return value;
}
function pendingActions(candidates: CoachCandidate[], applied = false): PendingAction[] {
  const actions: PendingAction[] = [];
  if (applied || candidates.some(c => c.kind === "checkin")) actions.push("review_checkin");
  if (candidates.some(c => c.kind === "workout_plan" || (c.kind === "profile" && ["goal", "weeklyHours"].includes(c.field)))) actions.push("review_plan");
  return actions;
}
function publicProposal(proposal: CoachConversationProposal | null) {
  if (!proposal) return null;
  const candidates = parsed<CoachCandidate[]>(proposal.candidates, "proposal");
  const receipt = proposal.receipt ? parsed<ConversationReceipt>(proposal.receipt, "receipt") : null;
  const bases = parsed<{ beforeProfile?: Record<string, CoachCandidate["value"]> }>(proposal.baseRevisions, "revisions");
  // Older proposals have no stored snapshot: show unknown rather than today's value as "before".
  const beforeValues = Object.fromEntries(candidates.filter(c => c.kind === "profile").map(c => [c.field, bases.beforeProfile?.[c.field] ?? null]));
  return { id: proposal.id, revision: proposal.revision, status: proposal.status, candidates, beforeValues, pendingActions: ["cancelled", "superseded"].includes(proposal.status) ? [] : receipt?.pendingActions ?? pendingActions(candidates), receipt, createdAt: proposal.createdAt };
}

function profileBeforeValues(profile: unknown, candidates?: CoachCandidate[]) {
  const values = profile && typeof profile === "object" ? profile as Record<string, unknown> : {};
  return Object.fromEntries((candidates ? candidates.filter(c => c.kind === "profile").map(c => c.field) : mutationFields.profile).map(field => {
    const value = values[field];
    return [field, typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null];
  }));
}

/** trainingAccess is still the standard authentication boundary; even an assigned
 * coach or administrator cannot enter somebody else's private assistant chat. */
export async function assistantAccess(req: Request) {
  const { actor, athlete } = await trainingAccess(req);
  if (actor.id !== athlete.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  return actor;
}

/** Bound before JSON parsing, including requests with no Content-Length header. */
export async function readConversationBody(req: Request, maxBytes = 8 * 1024 * 1024): Promise<Record<string, unknown>> {
  const announced = req.headers.get("content-length");
  if (announced && Number(announced) > maxBytes) throw new ApiError("Message is too large", 413);
  if (!req.body) throw new ApiError("Request body is required");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new ApiError("Message is too large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return object(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError("Invalid JSON body"); }
}

function publicMessage({metadata,...message}:{id:string;role:string;content:string;source:string;createdAt:Date;metadata:string|null}, language: unknown) {
  let clientRequestId:string|undefined,needsHumanReview=false,safetyReviewRequired=false;
  try {
    const meta=JSON.parse(metadata||'{}');
    if(typeof meta.clientRequestId==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(meta.clientRequestId))clientRequestId=meta.clientRequestId;
    needsHumanReview=meta.needsHumanReview===true;
    safetyReviewRequired=message.role === "assistant" && SAFETY_RULES.some(rule => meta.ruleId === `coach-conversation-v1:${rule}`);
    // Legacy derived summaries are never exposed or reused.
  }catch{/* Unverified metadata grants no action or context. */}
  if(message.role === "assistant") {
    let safe=false;try{safe=JSON.parse(metadata||"{}").historyPolicy===AI_DATA_POLICY_VERSION||JSON.parse(metadata||"{}").contextVersion===AI_DATA_POLICY_VERSION;}catch{}
    if(!safe)message.content=historySafeLocalReply("", language, true);
  }
  return {...message,...(clientRequestId?{clientRequestId}:{}),...(needsHumanReview?{needsHumanReview:true}:{}),...(safetyReviewRequired?{safetyReviewRequired:true}:{})};
}
async function readConversation(actor: ConversationActor, db: DB = prisma) {
  const [conversation, profile] = await Promise.all([
    db.coachConversation.findUnique({ where: { userId: actor.id } }),
    db.athleteProfile.findUnique({ where: { userId: actor.id } }),
  ]);
  const preferences = { displayUnits: unitsOf(profile?.units, actor.language), unitPreference: profile?.units ?? "auto" };
  if (!conversation) return { ...preferences, conversation: { id: null, messages: [] }, proposal: null, receipt: null, savedReceipt: null, pendingActions: [] as PendingAction[] };
  const [messages, proposal, savedProposal] = await Promise.all([
    db.coachConversationMessage.findMany({ where: { userId: actor.id, conversationId: conversation.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CONVERSATION_MESSAGE_LIMIT,
      select: { id: true, role: true, content: true, source: true, createdAt: true, metadata: true } }),
    db.coachConversationProposal.findFirst({ where: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    db.coachConversationProposal.findFirst({ where: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation, status: "confirmed" }, orderBy: [{ confirmedAt: "desc" }, { id: "desc" }] }),
  ]);
  const proposalView = publicProposal(proposal);
  let suggested: PendingAction[] = [];
  const latestAssistant = messages.find(message => message.role === "assistant");
  try { const metadata = JSON.parse(latestAssistant?.metadata || "{}"); if (Array.isArray(metadata.pendingActions)) suggested = metadata.pendingActions.filter((action: unknown): action is PendingAction => action === "review_checkin" || action === "review_plan"); } catch { /* Unverified metadata grants no action. */ }
  const savedReceipt = savedProposal?.receipt ? parsed<ConversationReceipt>(savedProposal.receipt, "receipt") : null;
  return { ...preferences, conversation: { id: conversation.id, messages: messages.reverse().map(message=>publicMessage(message,actor.language)) }, proposal: proposalView, receipt: proposalView?.receipt ?? savedReceipt, savedReceipt, pendingActions: [...new Set([...suggested, ...(proposalView?.pendingActions || [])])] };
}
export async function getConversation(actor: ConversationActor) {
  const today = dateKey(new Date(), actor.timezone);
  const [history, activePlan] = await Promise.all([
    readConversation(actor),
    prisma.trainingPlan.findFirst({ where: { userId: actor.id, status: 'active' }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
  ]);
  const sessions = await prisma.workout.findMany({ where: { ...currentOrReportedWorkoutWhere(actor.id, activePlan?.id ?? null), date: { gte: localDate(addDaysKey(today, -30), actor.timezone), lt: localDate(addDaysKey(today, 8), actor.timezone) } },
      orderBy: [{ date: "desc" }, { id: "desc" }], take: 80, select: { id: true, title: true, sport: true, date: true, planned:true, completed: true, feedbackStatus: true } });
  const todayOptions=sessions.filter(s=>s.planned&&!s.completed&&dateKey(s.date,actor.timezone)===today);
  return { ok: true, ...history, capabilities: coachCapabilities(), localToday: today,defaultSessionId:todayOptions.length===1?todayOptions[0].id:null, sessions: sessions.map(session => ({ ...session, date: dateKey(session.date, actor.timezone) })) };
}
function transactionError(error: unknown): never {
  const code = (error as { code?: string })?.code;
  if (code === "P2034" || code === "P2002") throw new ApiError("The conversation or athlete data changed at the same time. Reload and review before trying again.", 409);
  throw error;
}

/** Backward-compatible transport alias; the same strict new parser applies. */
export function parseAssistantInput(raw: unknown): ReturnType<typeof parseConversationInput> {
  const { clientRequestId: _requestId, ...body } = object(raw);
  if (Object.hasOwn(body, "question")) {
    if (Object.hasOwn(body, "message") || typeof body.question !== "string") throw new ApiError("Use one message field");
    const { question, ...rest } = body;
    try { return parseConversationInput({ ...rest, message: question }); }
    catch (error) { throw new ApiError((error as Error).message); }
  }
  try { return parseConversationInput(body); }
  catch (error) { throw new ApiError((error as Error).message); }
}

type RequestGuard = { id: string; conversationId: string; generation: number; revision: number; sessionId?:string; sessionRevision?: string };

/** Claim once before image decoding or provider work. This ledger stores only
 * hashes and operational state; clearing chat never preserves raw text here. */
export async function appendConversation(actor: ConversationActor, raw: unknown) {
  const body = object(raw);
  if (body.athleteId !== undefined && body.athleteId !== actor.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  const input = parseAssistantInput(body);
  const selectedSessionId = body.sessionId == null || body.sessionId === "" ? undefined : identifier(body.sessionId, "session");
  const requestedConversationId = body.conversationId === undefined ? undefined : identifier(body.conversationId, "conversation");
  const namedExternal = (input.externalConsent && input.textProviderConsent === "openai") || Boolean(input.image && input.imageConsent && input.imageProviderConsent === "openai");
  if (namedExternal && body.clientRequestId === undefined) throw new ApiError("An external request needs a stable clientRequestId before sending");
  const clientRequestId = body.clientRequestId === undefined ? randomUUID() : identifier(body.clientRequestId, "client request id");
  const requestHash = createHash("sha256").update(JSON.stringify({ input, sessionId: selectedSessionId ?? null, conversationId: requestedConversationId ?? null })).digest("hex");
  const metered = namedExternal || Boolean(input.image);
  let claim: { replayed: true } | { replayed: false; guard: RequestGuard };
  try {
    claim = await prisma.$transaction(async tx => {
      const now = new Date();
      const activePlan = await tx.trainingPlan.findFirst({ where: { userId: actor.id, status: 'active' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      const visible = currentOrReportedWorkoutWhere(actor.id, activePlan?.id ?? null);
      const explicit=selectedSessionId?await tx.workout.findFirst({where:{...visible,id:selectedSessionId}}):null;
      if(selectedSessionId&&!explicit)throw new ApiError('Session not found',404);
      const requestedDay=coachAutoSessionDay(input.message,dateKey(now,actor.timezone));
      const resolveDate=!!requestedDay&&(!explicit||dateKey(explicit.date,actor.timezone)!==requestedDay);
      const automatic=resolveDate?await tx.workout.findMany({where:{...visible,planned:true,completed:false,feedbackAt:null,feedbackStatus:null,feedbackNote:null,actualDurationMin:null,actualSport:null,actualDetails:null,rpe:null,avgHr:null,maxHr:null,avgPower:null,np:null,distanceKm:null,calories:null,preWeightKg:null,postWeightKg:null,externalId:null,matchedPlanId:null,date:{gte:localDate(requestedDay!,actor.timezone),lt:localDate(addDaysKey(requestedDay!,1),actor.timezone)}},take:2}):[];
      const selected=resolveDate?(automatic.length===1?automatic[0]:null):explicit;
      await tx.coachConversationRequest.updateMany({ where: { userId: actor.id, status: "processing", createdAt: { lt: new Date(now.getTime() - 90000) } }, data: { status: "unknown", activeKey: null, finishedAt: now } });
      const existing = await tx.coachConversationRequest.findFirst({ where: { userId: actor.id, clientRequestId } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ApiError("This request id belongs to different content. Start a new message.", 409);
        if (existing.status === "completed") return { replayed: true as const };
        throw new ApiError(existing.status === "processing" ? "This message is still processing. Do not send it again." : "This message's previous attempt did not complete reliably. Review the conversation before starting a new request.", 409);
      }
      const minute = new Date(now.getTime() - 60000), hour = new Date(now.getTime() - 3600000);
      const [allMinute, allHour, paidMinute, paidHour, active] = await Promise.all([
        tx.coachConversationRequest.count({ where: { userId: actor.id, createdAt: { gte: minute } } }),
        tx.coachConversationRequest.count({ where: { userId: actor.id, createdAt: { gte: hour } } }),
        metered ? tx.coachConversationRequest.count({ where: { userId: actor.id, metered: true, createdAt: { gte: minute } } }) : Promise.resolve(0),
        metered ? tx.coachConversationRequest.count({ where: { userId: actor.id, metered: true, createdAt: { gte: hour } } }) : Promise.resolve(0),
        metered ? tx.coachConversationRequest.findFirst({ where: { userId: actor.id, activeKey: actor.id } }) : Promise.resolve(null),
      ]);
      if (allMinute >= 30 || allHour >= 300 || paidMinute >= 6 || paidHour >= 30) throw new ApiError("Message limit reached. Wait before starting another request.", 429);
      if (active) throw new ApiError("Another image or external answer is still processing. Wait for it to finish.", 409);
      // Initialize even an empty chat so a concurrent clear creates a tombstone.
      const conversation = await tx.coachConversation.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} });
      if (requestedConversationId && requestedConversationId !== conversation.id) throw new ApiError("Conversation not found", 404);
      const row = await tx.coachConversationRequest.create({ data: { userId: actor.id, clientRequestId, requestHash, metered, activeKey: metered ? actor.id : null, conversationId: conversation.id, generation: conversation.generation, revision: conversation.revision } });
      return { replayed: false as const, guard: { id: row.id, conversationId: conversation.id, generation: conversation.generation, revision: conversation.revision, ...(selected ? { sessionId:selected.id,sessionRevision: workoutRevision(selected) } : {}) } };
    }, { isolationLevel: "Serializable" });
  } catch (error) { transactionError(error); }
  if (claim.replayed) {
    const history = await prisma.$transaction(tx => readConversation(actor, tx), { isolationLevel: "Serializable" });
    const lastAnswer = [...history.conversation.messages].reverse().find(message => message.role === "assistant");
    return { ...history, capabilities: coachCapabilities(), ok: true, replayed: true, mode: lastAnswer?.source === "openai" ? "coach_ai" : "coach_local", answer: lastAnswer?.content ?? "", trainingModified: false, externalStatus: "not_requested", imageStatus: "not_requested" };
  }
  const guard = claim.guard;
  const finish = async (status: "completed" | "failed") => prisma.$transaction(tx => tx.coachConversationRequest.updateMany({ where: { id: guard.id, userId: actor.id, status: "processing" }, data: { status, activeKey: null, finishedAt: new Date() } }), { isolationLevel: "Serializable" });
  try {
    const result = await appendClaimedConversation(actor, body, guard);
    await finish("completed");
    return { ...result, replayed: false };
  } catch (error) {
    try { await finish("failed"); } catch { /* An uncertain claim is never retried automatically. */ }
    throw error;
  }
}

async function appendClaimedConversation(actor: ConversationActor, raw: unknown, guard: RequestGuard) {
  const body = object(raw);
  // Explicitly reject cross-athlete bodies as well as query-string overrides.
  if (body.athleteId !== undefined && body.athleteId !== actor.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  const input = parseAssistantInput(body);
  const sessionId = guard.sessionId;
  const today = dayBounds(actor.timezone);
  // Most chat turns do not need a 90-day load series. Keep today's performed
  // activity for recovery safeguards, and read the full history only for a
  // JMetrics question. Missing metrics are never replaced with partial totals.
  const contextNeeds = coachContextNeeds(input.message);
  const needsLoadHistory = contextNeeds.load;
  let image: Awaited<ReturnType<typeof extractImageCandidates>> | null = null;
  try { if (input.image) image = await extractImageCandidates(input.image, { localToday: today.key, imageConsent: input.imageConsent, imageProviderConsent: input.imageProviderConsent, imageSource: input.imageSource, sessionId }, createCoachVisionProvider()); }
  catch (error) { throw new ApiError((error as Error).message); }
  try {
    const local = await prisma.$transaction(async tx => {
      const current = await tx.coachConversation.findUnique({ where: { userId: actor.id } });
      if (!current || current.id !== guard.conversationId || current.generation !== guard.generation || current.revision !== guard.revision) throw new ApiError("The conversation changed while this message was processing. Review the current conversation before sending again.", 409);
      const conversation = await tx.coachConversation.update({ where: { id: current.id, userId: actor.id }, data: { revision: { increment: 1 } } });
      const [profile, setup, checkin, selected, planned, recentFeedback, safetyConcern, loadWorkouts, restObservations, plannedRestDay, todayRecoverySessions, latestMetrics, nextRace] = await Promise.all([
        tx.athleteProfile.findUnique({ where: { userId: actor.id } }),
        readPlanningSetup(actor.id, tx),
        tx.dailyCheckin.findUnique({ where: { userId_date: { userId: actor.id, date: today.start } } }),
        sessionId ? tx.workout.findFirst({ where: { id: sessionId, userId: actor.id } }) : Promise.resolve(null),
        tx.workout.findFirst({ where: { userId: actor.id, date: { gte: today.start, lt: today.end }, planned: true, completed: false, approved: true }, orderBy: [{ startTime: "asc" }, { id: "asc" }], include: { planDay: { select: { dayOff: true } } } }),
        contextNeeds.history !== "none" ? tx.workout.findMany({
          where: { userId: actor.id, matchedPlanId: null, date: { gte: localDate(addDaysKey(today.key, -89), actor.timezone), lt: today.end },
            OR: [{ completed: true }, { feedbackStatus: { not: null } }, { actualDurationMin: { not: null } }, { actualSport: { not: null } }, { rpe: { not: null } }] },
          orderBy: [{ date: "desc" }, { id: "desc" }], take: contextNeeds.history === "overview" ? 200 : 1,
          select: { date: true, planned: true, completed: true, durationMin: true, sport: true, feedbackStatus: true, actualDurationMin: true, actualSport: true, rpe: true },
        }) : Promise.resolve([]),
        tx.coachConversationMessage.findFirst({ where: { userId: actor.id, conversationId: conversation.id, role: "assistant", OR: [...SAFETY_RULES.map(rule => ({ metadata: { contains: `\"ruleId\":\"coach-conversation-v1:${rule}\"` } })), { metadata: { contains: '"requiresCheckinReview":true' } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
        tx.workout.findMany({ where: { userId: actor.id, OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }], matchedPlanId: null, date: { gte: needsLoadHistory ? localDate(addDaysKey(today.key, -89), actor.timezone) : today.start, lt: today.end } }, select: ACTIVITY_EVIDENCE_SELECT }),
        needsLoadHistory ? tx.metricObservation.findMany({ where: { userId: actor.id, metricType: "jmm_rest_day", value: 1, source: "manual", qualityFlag: "ok", measurementMethod: "athlete_reported_rest", observedAt: { gte: localDate(addDaysKey(today.key, -89), actor.timezone), lt: today.end } }, select: { observedAt: true } }) : Promise.resolve([]),
        tx.planDay.findFirst({ where: { plan: { userId: actor.id, status: "active" }, date: { gte: today.start, lt: today.end }, dayOff: true }, select: { id: true } }),
        tx.workout.findMany({ where: { userId: actor.id, date: { gte: today.start, lt: today.end } }, orderBy: [{ startTime: "asc" }, { id: "asc" }], select: { id: true, date: true, title: true, sport: true, durationMin: true, intensity: true, planned: true, approved: true, completed: true, planDay: { select: { dayOff: true } } } }),
        contextNeeds.overview ? tx.dailyMetrics.findFirst({
          where: { userId: actor.id, date: { gte: localDate(addDaysKey(today.key, -7), actor.timezone), lt: today.end } },
          orderBy: { date: "desc" }, select: { date: true, source: true, hrv: true, hrvType: true, restingHr: true, sleepHours: true },
        }) : Promise.resolve(null),
        contextNeeds.overview ? tx.race.findFirst({
          where: { userId: actor.id, date: { gte: new Date(`${today.key}T00:00:00Z`) } },
          orderBy: [{ priority: "asc" }, { date: "asc" }], select: { name: true, date: true, distance: true },
        }) : Promise.resolve(null),
      ]);
      if (sessionId && !selected) throw new ApiError("Session not found", 404);
      if (selected && guard.sessionRevision !== workoutRevision(selected)) throw new ApiError("The selected session changed while this message was processing. Review it before sending again.", 409);
      const sessionDate = selected ? dateKey(selected.date, actor.timezone) : undefined;
      let candidates: CoachCandidate[];
      try {
        candidates = coachPlanChangeWarnings(validateCoachCandidates([
          ...extractLocalCandidates(input.message, { localToday: today.key, source: input.source, sessionId, sessionDate }),
          ...(image?.candidates ?? []),
        ], { localToday: today.key }),selected);
      } catch (error) { throw new ApiError((error as Error).message); }
      for (const candidate of candidates) {
        if (candidate.kind.startsWith("workout") && candidate.sessionId && candidate.sessionId !== selected?.id) throw new ApiError("Candidate session does not match your selected session");
        if (candidate.kind === "workout_feedback" && candidate.sessionId && (candidate.observedDate !== sessionDate || sessionDate! > today.key)) throw new ApiError("Feedback must match the selected session's date and cannot describe the future");
      }
      const planning = assessPlanningSetup(profile, setup.setup, new Date(), "daily");
      const effective = planned ? await effectivePrescription(actor.id, planned.id, tx) : null;
      let answers: Record<string, unknown> = {};
      if (checkin) { try { answers = object(JSON.parse(checkin.answers || "{}")); } catch { /* Fail closed without valid current safety answers. */ } }
      const unreviewedCurrentCheckin = candidates.some(candidate => candidate.kind === "checkin" && candidate.observedDate === today.key);
      const possibleCurrentSymptom = candidates.some(candidate => candidate.kind === "checkin" && ["sick", "newPain", "urgentSymptoms", "painAffectsMovement"].includes(candidate.field) && candidate.value === true);
      const plannedRecoverySessions = todayRecoverySessions.filter(row => row.planned);
      const context: CoachReplyContext = {
        externalFacts: undefined,
        savedTodaySessions: plannedRecoverySessions.map(row => ({ date: dateKey(row.date, actor.timezone), title: row.title, sport: row.sport, durationMin: row.durationMin, completed: row.completed })),
        localToday: today.key, language: actor.language, setupReady: planning.ready,
        candidateContext: { sessionId, sessionDate },
        recovery: dailyRecoveryContext({
          plannedRest: !!plannedRestDay || (!!plannedRecoverySessions.length && plannedRecoverySessions.every(row => row.planDay?.dayOff)),
          sessions: plannedRecoverySessions.map(row => ({ durationMin: row.id === planned?.id && effective ? effective.canonical.durationMin : row.durationMin, intensity: row.intensity,
            verdict: row.id === planned?.id ? effective?.canonical.verdict ?? "blocked" : row.planned && !row.approved && !row.completed ? "blocked" : undefined })),
          performedToday: loadWorkouts.some(row => row.date <= new Date() && dateKey(row.date, actor.timezone) === today.key),
          injured: !!profile?.injured, answers: checkin && !unreviewedCurrentCheckin ? answers : null,
        }),
        jMetrics: needsLoadHistory ? computeJMetrics(loadWorkouts, new Date(), actor.timezone, restObservations.map(row => dateKey(row.observedAt, actor.timezone)),90,await readActivityDecisions(actor.id,tx)) : null,
        unreviewedImageConcern: candidates.some(c => c.source === "image" && c.kind === "checkin" && c.field === "urgentSymptoms" && c.value === true) ? "urgent" : candidates.some(c => c.source === "image" && c.kind === "checkin" && ["sick", "newPain", "painAffectsMovement"].includes(c.field) && c.value === true) ? "symptom" : undefined,
        unresolvedSafetyConcernAt: possibleCurrentSymptom ? new Date().toISOString() : safetyConcern?.createdAt.toISOString() ?? null,
        athleteOverview: contextNeeds.overview ? {
          metrics: latestMetrics ? { date: dateKey(latestMetrics.date, actor.timezone), source: latestMetrics.source, hrv: latestMetrics.hrv, hrvType: latestMetrics.hrvType, restingHr: latestMetrics.restingHr, sleepHours: latestMetrics.sleepHours } : null,
          race: nextRace ? { name: nextRace.name, date: nextRace.date.toISOString().slice(0, 10), distance: nextRace.distance } : null,
          historyDays: 90,
        } : undefined,
        profile: profile ? { goal: profile.goal, experience: profile.experience, weeklyHours: profile.weeklyHours, weightKg: profile.weightKg } : null,
        recentFeedback: recentFeedback.map(row => ({ ...row, actualDurationMin:row.actualDurationMin ?? (!row.planned && row.completed ? row.durationMin : null), actualSport:row.actualSport ?? (!row.planned && row.completed ? row.sport : null), feedbackStatus:row.feedbackStatus ?? (row.completed ? "completed" : null), date: dateKey(row.date, actor.timezone) })),
        recentMessages: [],
        checkin: checkin ? { ...answers, ...(profile?.injured ? { newPain: true } : {}), observedDate: today.key, recordedAt: (() => { const meta = answers.inputMetadata; if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null; const value = (meta as Record<string, unknown>).recordedAt; return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() ? value : null; })() } : undefined,
        approvedSession: !unreviewedCurrentCheckin && effective?.canonical.verdict === "ready" && planned ? { id: planned.id, title: planned.title, sport: planned.sport, durationMin: effective.canonical.durationMin, date: today.key, isRestDay: planned.planDay?.dayOff ?? false, hasWarmup: effective.canonical.steps.some(step => step.phase === "warmup"), approved: true } : undefined,
      };
      // Chat prose uses a structurally separate context. Device/local analytical
      // context remains in Today/Plan and in server-owned validation only.
      const chatContext:CoachReplyContext={...context,profile:null,externalFacts:undefined,athleteOverview:undefined,jMetrics:null,recentFeedback:[],savedTodaySessions:[],approvedSession:undefined,recentMessages:[],checkin:undefined,recovery:undefined,unresolvedSafetyConcernAt:null,unreviewedImageConcern:undefined};
      const safetyReply=buildCoachReply(input.message,context);
      const safetyHeld=SAFETY_RULES.some(rule=>safetyReply.ruleId===`coach-conversation-v1:${rule}`);
      const localRecordQuestion=/^coach-conversation-v1:(?:saved-training-navigation|remember-confirmed-|remember-reported-|missing-reported-)/.test(safetyReply.ruleId);
      const reply = safetyHeld ? safetyReply : localRecordQuestion||contextNeeds.overview||contextNeeds.history!=="none"||contextNeeds.load
        ? {answer:historySafeLocalReply("",actor.language,true),ruleId:"coach-conversation-v1:local-data-review",sourceIds:[]}
        : buildCoachReply(input.message, chatContext);
      const suggestedActions: PendingAction[] = SAFETY_RULES.some(rule => reply.ruleId === `coach-conversation-v1:${rule}`) ? ["review_checkin"] : [];
      const clarifications = reply.ruleId === "coach-conversation-v1:clarify-data" ? [] : conversationClarifications(input.message, { localToday: today.key, source: input.source, sessionId, sessionDate });
      const answer = [reply.answer, candidates.length ? actor.language === "es" ? "¿Quieres aplicar estos cambios? Revisa los valores abajo y confirma solo los correctos. Aún no se ha guardado nada." : "Apply these changes? Review the values below and confirm only those that are correct. Nothing has been saved yet." : "", ...clarifications, ...(image?.warnings ?? [])].filter(Boolean).join("\n\n");
      const userMessage = await tx.coachConversationMessage.create({ data: { conversationId: conversation.id, userId: actor.id, role: "user", content: input.message || "Image attached for review", source: input.image ? "image" : input.source,
        metadata: JSON.stringify({ clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : null, localDate: today.key, timezone: actor.timezone, sessionId: sessionId ?? null, externalConsent: input.externalConsent, textProviderConsent: input.textProviderConsent ?? null, imageConsent: input.imageConsent, imageProviderConsent: input.imageProviderConsent ?? null, imageStatus: image?.status ?? null,imageSource: input.imageSource??null }) } });
      if (candidates.length) {
        await tx.coachConversationProposal.updateMany({ where: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation, status: "pending" }, data: { status: "superseded", revision: { increment: 1 } } });
        await tx.coachConversationProposal.create({ data: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation, sourceMessageId: userMessage.id, timezone: actor.timezone,
          candidates: JSON.stringify(candidates), baseRevisions: JSON.stringify({ profile: profileRevision(profile), beforeProfile: profileBeforeValues(profile, candidates), workouts: selected ? { [selected.id]: { revision: workoutRevision(selected), date: sessionDate } } : {} }) } });
      }
      const assistantMessage = await tx.coachConversationMessage.create({ data: { conversationId: conversation.id, userId: actor.id, role: "assistant", content: answer, source: "local", metadata: JSON.stringify({ historyPolicy:AI_DATA_POLICY_VERSION, ruleId: reply.ruleId, sourceIds: reply.sourceIds ?? [],needsHumanReview:suggestedActions.length>0||reply.ruleId==='coach-conversation-v1:ask-next-detail', requiresCheckinReview: unreviewedCurrentCheckin, pendingActions: suggestedActions, imageStatus: image?.status ?? null }) } });
      return { ok: true, answer, mode: "coach_local", trainingModified: false, externalStatus: input.externalConsent ? "not_configured" : "not_requested", imageStatus: image?.status ?? "not_requested", capabilities: coachCapabilities(), ...await readConversation(actor, tx), _context: context, _guard: { conversationId: conversation.id, revision: conversation.revision, generation: conversation.generation, messageId: assistantMessage.id,sourceMessageId:userMessage.id,baseRevisions:{profile:profileRevision(profile),beforeProfile:profileBeforeValues(profile),workouts:selected?{[selected.id]:{revision:workoutRevision(selected),date:sessionDate}}:{}} }, _ruleId: reply.ruleId, _hasCandidates: candidates.length > 0 };
    }, { isolationLevel: "Serializable", timeout: 20000 });
    const { _context, _guard, _ruleId, _hasCandidates, ...result } = local;
    // Network work never runs inside a database transaction. A concurrent clear,
    // confirmation or new message prevents late provider output replacing state.
    const provider = await coachTextAnswer({ message: input.message, localRuleId: _ruleId, context: _context, externalConsent: input.externalConsent,aiReplyMemoryConsent:input.aiReplyMemoryConsent, textProviderConsent: input.textProviderConsent, hasCandidates: _hasCandidates });
    if (!provider.answer) {
      const history = await prisma.$transaction(tx => readConversation(actor, tx), { isolationLevel: "Serializable" });
      const lastAnswer = [...history.conversation.messages].reverse().find(message => message.role === "assistant");
      return { ...result, ...history, answer: lastAnswer?.content ?? "", externalStatus: provider.status };
    }
    const disclosure = actor.language === "es" ? "OpenAI · educación general sin contexto personal ni memoria. Los cambios se revisan en JMM." : "OpenAI · general education without personal context or memory. Changes are reviewed in JMM.";
    try {
      return await prisma.$transaction(async tx => {
        const current = await tx.coachConversation.findUnique({ where: { userId: actor.id } });
        if (!current || current.id !== _guard.conversationId || current.generation !== _guard.generation || current.revision !== _guard.revision) {
          const history = await readConversation(actor, tx);
          return { ...result, ...history, answer: [...history.conversation.messages].reverse().find(message => message.role === "assistant")?.content ?? "", externalStatus: "unavailable" };
        }
        let interpreted=validateCoachCandidates((provider.candidates||[]).map(c=>({...c,source:input.source})),{localToday:today.key});
        if(interpreted.length) {
          const sessionIds=[...new Set(interpreted.flatMap(c=>c.kind.startsWith('workout')&&c.sessionId?[c.sessionId]:[]))];
          const [currentProfile,workouts]=await Promise.all([tx.athleteProfile.findUnique({where:{userId:actor.id}}),Promise.all(sessionIds.map(id=>tx.workout.findFirst({where:{id,userId:actor.id}})))]);
          if(profileRevision(currentProfile)!==_guard.baseRevisions.profile)throw new ApiError('Your profile changed. Send the request again with current values.',409);
          for(const candidate of interpreted.filter(c=>c.kind.startsWith('workout'))) {
            const base=_guard.baseRevisions.workouts[candidate.sessionId!];
            const workout=workouts.find(w=>w?.id===candidate.sessionId);
            if(!base||!workout||workoutRevision(workout)!==base.revision||candidate.observedDate!==base.date)throw new ApiError('The selected workout changed. Review the current session before proposing changes.',409);
          }
          interpreted=interpreted.map(c=>coachPlanChangeWarnings([c],workouts.find(w=>w?.id===c.sessionId)??null)[0]);
          await tx.coachConversationProposal.updateMany({where:{userId:actor.id,conversationId:current.id,generation:current.generation,status:'pending'},data:{status:'superseded',revision:{increment:1}}});
          await tx.coachConversationProposal.create({data:{userId:actor.id,conversationId:current.id,generation:current.generation,sourceMessageId:_guard.sourceMessageId,timezone:actor.timezone,candidates:JSON.stringify(interpreted),baseRevisions:JSON.stringify(_guard.baseRevisions)}});
        }
        const review=interpreted.length?(actor.language==='es'?'Revisa y confirma los valores abajo; todavía no se han guardado.':'Review and confirm the values below; they have not been saved yet.'):'';
        const answer = [provider.answer,review,disclosure].filter(Boolean).join('\n\n');
        const updated = await tx.coachConversationMessage.updateMany({ where: { id: _guard.messageId, userId: actor.id, conversationId: current.id }, data: { content: answer, source: "openai", metadata: JSON.stringify({ ruleId: _ruleId, provider: "OpenAI", namedConsent: "openai", contextVersion: AI_DATA_POLICY_VERSION, sourceIds: provider.sourceIds ?? [],needsHumanReview:provider.needsHumanReview===true,externalConsent: true }) } });
        if (updated.count !== 1) throw new ApiError('The conversation changed before the interpreted reply could be saved.',409);
        await tx.coachConversation.update({ where: { id: current.id, userId: actor.id }, data: { revision: { increment: 1 } } });
        return { ...result, ...await readConversation(actor, tx), answer, mode: "coach_ai", externalStatus: "answered", disclosure };
      }, { isolationLevel: "Serializable" });
    } catch { return { ...result, ...await readConversation(actor), externalStatus: "unavailable" }; }
  } catch (error) { transactionError(error); }
}

/** Only values can change during review. Identity, date, session, units, source,
 * evidence and warnings remain exactly bound to the server's saved candidate. */
export function validateSelectedCandidates(stored: CoachCandidate[], selected: unknown, localToday: string): CoachCandidate[] {
  if (!Array.isArray(selected) || !selected.length || selected.length > 30) throw new ApiError("Select at least one proposed value");
  let valid: CoachCandidate[];
  try { valid = validateCoachCandidates(selected, { localToday, allowStoredLegacyRpeUnit: true }); } catch (error) { throw new ApiError((error as Error).message); }
  if (valid.length !== selected.length || !valid.length) throw new ApiError("Every selected value must be valid and conflict-free");
  const ids = new Set<string>();
  const destinations = new Set<string>();
  for (let index = 0; index < valid.length; index++) {
    const candidate = valid[index];
    const original = stored.find(c => c.id === candidate.id);
    if (!original || ids.has(candidate.id)) throw new ApiError("The selected value was not in this proposal");
    ids.add(candidate.id);
    const supplied = object(selected.find(raw => object(raw).id === candidate.id));
    const allowedKeys = new Set(Object.keys(original));
    if (Object.keys(supplied).some(key => !allowedKeys.has(key))) throw new ApiError("Candidate provenance cannot be changed");
    for (const key of Object.keys(original)) if (key !== "value" && JSON.stringify(supplied[key]) !== JSON.stringify(original[key as keyof CoachCandidate])) throw new ApiError("Candidate provenance cannot be changed");
    if (candidate.kind === "profile" || candidate.kind === "workout_feedback" || candidate.kind === "workout_plan") {
      const destination = `${candidate.kind}:${candidate.sessionId || ""}:${candidate.field}`;
      if (destinations.has(destination)) throw new ApiError("Select only one value per saved field, even when observation dates differ");
      destinations.add(destination);
      if (!mutationFields[candidate.kind].includes(candidate.field)) throw new ApiError("This field cannot be applied from the conversation");
    }
    if ((candidate.kind === "workout_feedback" || candidate.kind === "workout_plan") && !candidate.sessionId) throw new ApiError("Choose the session and send this report again before saving");
  }
  return valid.map(candidate => ({ ...stored.find(original => original.id === candidate.id)!, value: candidate.value }));
}

export async function confirmConversation(actor: ConversationActor, raw: unknown) {
  const body = object(raw);
  if (body.confirmed !== true) throw new ApiError("Explicit confirmation is required");
  if (body.athleteId !== undefined && body.athleteId !== actor.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  const proposalId = identifier(body.proposalId, "proposal");
  const idempotencyKey = identifier(body.idempotencyKey, "confirmation key");
  if (!Number.isInteger(body.expectedRevision) || Number(body.expectedRevision) < 1) throw new ApiError("Reload the proposal before confirming", 409);
  const today = dateKey(new Date(), actor.timezone);
  try {
    return await prisma.$transaction(async tx => {
      const proposal = await tx.coachConversationProposal.findFirst({ where: { id: proposalId, userId: actor.id } });
      if (!proposal) throw new ApiError("Proposal not found", 404);
      const stored = parsed<CoachCandidate[]>(proposal.candidates, "proposal");
      const selected = validateSelectedCandidates(stored, body.candidates, today);
      const requestHash = createHash("sha256").update(JSON.stringify({ proposalId, expectedRevision: body.expectedRevision, candidates: [...selected].sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
      if (["cancelled", "superseded"].includes(proposal.status)) throw new ApiError("This proposal is no longer pending", 409);
      if (proposal.receipt) {
        if (proposal.idempotencyKey !== idempotencyKey || proposal.requestHash !== requestHash) throw new ApiError("This proposal was already reviewed with a different confirmation", 409);
        const receipt = parsed<ConversationReceipt>(proposal.receipt, "receipt");
        return { ...await readConversation(actor, tx), ok: true, replayed: true, applied: receipt.applied.length > 0, trainingModified: receipt.applied.some(c=>c.kind==="workout_plan"), prescriptionModified: receipt.applied.some(c=>c.kind==="workout_plan"), profileModified: receipt.applied.some(c => c.kind === "profile"), actualsModified: receipt.applied.some(c => c.kind === "workout_feedback"), receipt, pendingAction: receipt.pendingActions[0] ?? null, pendingActions: receipt.pendingActions };
      }
      const conversation = await tx.coachConversation.findUnique({ where: { userId: actor.id } });
      if (!conversation || proposal.generation !== conversation.generation || proposal.status !== "pending" || proposal.revision !== body.expectedRevision || proposal.timezone !== actor.timezone) throw new ApiError("This proposal is no longer current. Send a new message and review it again.", 409);
      if (Date.now() - proposal.createdAt.getTime() > 7 * 86400000) throw new ApiError("This proposal expired. Send the current information again.", 409);
      const priorKey = await tx.coachConversationProposal.findFirst({ where: { userId: actor.id, idempotencyKey } });
      if (priorKey) throw new ApiError("This confirmation key was already used", 409);
      const bases = parsed<{ profile: string; workouts: Record<string, { revision: string; date: string }> }>(proposal.baseRevisions, "revisions");
      const profile = await tx.athleteProfile.findUnique({ where: { userId: actor.id } });
      if (profileRevision(profile) !== bases.profile) throw new ApiError("Your profile changed since this proposal. Send a new message and review the latest values.", 409);
      const profileFields: Record<string, unknown> = {};
      const workoutFields = new Map<string, Record<string, unknown>>();
      for (const candidate of selected) {
        if (candidate.kind === "profile") profileFields[candidate.field] = candidate.value;
        if (candidate.kind === "workout_feedback" || candidate.kind === "workout_plan") {
          const base = bases.workouts[candidate.sessionId!];
          if (!base || candidate.observedDate !== base.date || (candidate.kind === "workout_feedback" ? base.date > today : base.date < today)) throw new ApiError("Session and observation date must match the original proposal", 409);
          const fields = workoutFields.get(candidate.sessionId!) ?? {};
          fields[candidate.field] = candidate.value;
          workoutFields.set(candidate.sessionId!, fields);
        }
      }
      const beforeProfileValues = profileBeforeValues(profile, selected);
      const entityIds = new Map<string, string>();
      const reason = `Athlete confirmed private assistant proposal ${proposal.id}; source message ${proposal.sourceMessageId}; immutable provenance in coach.conversation.confirmed audit`;
      if (Object.keys(profileFields).length) {
        const saved = await saveProfile(actor.id, actor, { ...profileFields, expectedRevision: bases.profile, reason }, tx);
        entityIds.set("profile", saved.id);
      }
      const activePlan = workoutFields.size ? await tx.trainingPlan.findFirst({ where: { userId: actor.id, status: 'active' }, orderBy: { createdAt: 'desc' }, select: { id: true } }) : null;
      for (const [sessionId, fields] of workoutFields) {
        const existing = await tx.workout.findFirst({ where: { ...currentOrReportedWorkoutWhere(actor.id, activePlan?.id ?? null), id: sessionId },include:{planDay:true} });
        const base = bases.workouts[sessionId];
        if (!existing || dateKey(existing.date, actor.timezone) !== base.date || workoutRevision(existing) !== base.revision) throw new ApiError("The session changed since this proposal. Send a new message and review it again.", 409);
        const edits=selected.some(c=>c.kind==="workout_plan" && c.sessionId===sessionId);
        if(edits && selected.some(c=>c.kind==="workout_feedback" && c.sessionId===sessionId)) throw new ApiError("Review planned changes and actual feedback separately");
        if(edits && (existing.planDay?.dayOff || existing.durationMin===0 || existing.sport==="recovery" || ["race","test"].includes(existing.type))) throw new ApiError("Rest, race and test sessions require a separate cycle review",409);
        const saved = await updateWorkout(actor.id, actor, { ...fields, sessionId, expectedRevision: base.revision, protectHistory:edits, reason }, tx);
        entityIds.set(sessionId, saved.id);
      }
      const applied = selected.filter(c => c.kind === "profile" || c.kind === "workout_feedback" || c.kind === "workout_plan").map(candidate => ({ candidateId: candidate.id, kind: candidate.kind, field: candidate.field, value: candidate.value, ...(candidate.kind === "profile" ? { previousValue: beforeProfileValues[candidate.field] } : {}), sourceValue: stored.find(c => c.id === candidate.id)!.value, source: candidate.source, observedDate: candidate.observedDate, ...(candidate.sessionId ? { sessionId: candidate.sessionId } : {}), entityId: entityIds.get(candidate.kind === "profile" ? "profile" : candidate.sessionId!)!, evidence: candidate.evidence }));
      const trainingModified=applied.some(c=>c.kind==="workout_plan");
      const actions = pendingActions(selected.filter(c=>c.kind!=="workout_plan"), applied.length > 0);
      const receipt: ConversationReceipt = { id: randomUUID(), proposalId, confirmedAt: new Date().toISOString(), applied, pendingActions: actions, checkinDraft: selected.filter(c => c.kind === "checkin"), planDraft: [],
        message: trainingModified ? (actor.language === "es" ? "Se guardaron los cambios confirmados. La aprobación anterior del entrenamiento se retiró: revisa el check-in y la nueva estructura antes de entrenar o publicar. No se envió nada al reloj." : "Confirmed changes saved. Previous workout approval was removed: review your check-in and the new structure before training or publishing. Nothing was sent to a watch.") : actor.language === "es" ? applied.length ? "Se guardaron los valores confirmados del perfil o del trabajo realizado. Revisa el check-in de hoy para reevaluar el entrenamiento. No se han reescrito las sesiones de hoy ni las futuras." : "Estos valores necesitan revisión en el check-in. No se ha guardado ningún cambio." : applied.length ? "Confirmed profile or actual-work values saved. Review today's check-in to reassess training. Daily and future prescriptions have not been rewritten." : "These values need review in the check-in. No change has been saved." };
      await tx.coachConversationProposal.update({ where: { id: proposal.id, userId: actor.id }, data: { status: applied.length ? "confirmed" : "review_required", revision: { increment: 1 }, idempotencyKey, requestHash, receipt: JSON.stringify(receipt), confirmedAt: new Date(receipt.confirmedAt) } });
      if (applied.length) await tx.auditLog.create({ data: { id: receipt.id, actorId: actor.id, subjectId: actor.id, action: "coach.conversation.confirmed", entityId: proposal.id, before: JSON.stringify({ candidates: stored.filter(c => applied.some(a => a.candidateId === c.id)).map(({ evidence: _chatText, warnings: _chatWarnings, ...facts }) => facts), sourceMessageId: proposal.sourceMessageId, baseRevisions: bases }), after: JSON.stringify({ ...receipt, applied: receipt.applied.map(({ evidence: _chatText, ...facts }) => facts), checkinDraft: [], planDraft: [] }), note: `Athlete-confirmed ${actor.timezone}; explicit reviewed profile, actuals and selected workout edits; approvals revoked for edited prescriptions` } });
      await tx.coachConversationMessage.create({ data: { userId: actor.id, conversationId: conversation.id, role: "assistant", source: "local", content: receipt.message, metadata: JSON.stringify({ historyPolicy:AI_DATA_POLICY_VERSION, proposalId, receiptId: receipt.id, applied: applied.length > 0 }) } });
      await tx.coachConversation.update({ where: { id: conversation.id, userId: actor.id }, data: { revision: { increment: 1 } } });
      return { ...await readConversation(actor, tx), ok: true, applied: applied.length > 0, trainingModified, prescriptionModified: trainingModified, profileModified: applied.some(c => c.kind === "profile"), actualsModified: applied.some(c => c.kind === "workout_feedback"), receipt, pendingAction: actions[0] ?? null, pendingActions: actions };
    }, { isolationLevel: "Serializable", timeout: 20000 });
  } catch (error) { transactionError(error); }
}

export async function cancelConversationProposal(actor: ConversationActor, raw: unknown) {
  const body = object(raw);
  if (body.athleteId !== undefined && body.athleteId !== actor.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  const proposalId = identifier(body.proposalId, "proposal");
  try {
    return await prisma.$transaction(async tx => {
      const proposal = await tx.coachConversationProposal.findFirst({ where: { id: proposalId, userId: actor.id } });
      if (!proposal) throw new ApiError("Proposal not found", 404);
      if (proposal.status === "confirmed") throw new ApiError("Saved values cannot be cancelled. Submit a correction instead.", 409);
      if (proposal.status === "pending" || proposal.status === "review_required") await tx.coachConversationProposal.update({ where: { id: proposalId, userId: actor.id }, data: { status: "cancelled", revision: { increment: 1 }, receipt: null } });
      return { ok: true, applied: false, cancelled: true, ...await readConversation(actor, tx) };
    }, { isolationLevel: "Serializable" });
  } catch (error) { transactionError(error); }
}

export async function clearConversation(actor: ConversationActor, raw: unknown) {
  const body = object(raw);
  if (body.confirmed !== true) throw new ApiError("Confirm clearing this private conversation first");
  if (body.athleteId !== undefined && body.athleteId !== actor.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  try {
    return await prisma.$transaction(async tx => {
      const conversation = await tx.coachConversation.findUnique({ where: { userId: actor.id } });
      if (conversation) {
        await tx.coachConversationMessage.deleteMany({ where: { userId: actor.id, conversationId: conversation.id } });
        const proposals = await tx.coachConversationProposal.findMany({ where: { userId: actor.id, conversationId: conversation.id } });
        for (const proposal of proposals) {
          const receipt = proposal.status === "confirmed" && proposal.receipt ? parsed<ConversationReceipt>(proposal.receipt, "receipt") : null;
          // Keep only actually saved facts. Unselected, cancelled, superseded and
          // deferred chat details are not part of the retained health record.
          const candidates = receipt ? parsed<CoachCandidate[]>(proposal.candidates, "proposal").filter(c => receipt.applied.some(a => a.candidateId === c.id)).map(({ warnings: _chatWarnings, ...candidate }) => ({ ...candidate, evidence: `Confirmed ${candidate.field}: ${String(candidate.value)}` })) : [];
          const retainedReceipt = receipt ? { ...receipt, applied: receipt.applied.map(item => ({ ...item, evidence: `Confirmed ${item.field}: ${String(item.sourceValue)}` })), checkinDraft: [], planDraft: [], pendingActions: receipt.applied.length ? ["review_checkin"] : [] } : null;
          await tx.coachConversationProposal.update({ where: { id: proposal.id, userId: actor.id }, data: { status: receipt ? "confirmed" : "cancelled", candidates: JSON.stringify(candidates), receipt: retainedReceipt ? JSON.stringify(retainedReceipt) : null, baseRevisions: "{}", revision: { increment: 1 } } });
        }
        await tx.coachConversation.update({ where: { id: conversation.id, userId: actor.id }, data: { generation: { increment: 1 }, revision: { increment: 1 } } });
      }
      return { ok: true, cleared: true, trainingModified: false, capabilities: coachCapabilities(), ...await readConversation(actor, tx) };
    }, { isolationLevel: "Serializable" });
  } catch (error) { transactionError(error); }
}
