import { createHash, randomUUID } from "node:crypto";
import type { Prisma, CoachConversationProposal } from "@prisma/client";
import { prisma } from "./db";
import { ApiError, trainingAccess } from "./access";
import { dateKey, dayBounds, localDate, addDaysKey } from "./dates";
import { profileRevision, saveProfile } from "./profile-service";
import { updateWorkout, workoutRevision } from "./workout-update";
import { readPlanningSetup } from "./planning-setup-store";
import { assessPlanningSetup } from "./planning-setup";
import { effectivePrescription } from "./effective-prescription";
import { parseConversationInput, extractLocalCandidates, validateCoachCandidates, buildCoachReply, conversationClarifications, type CoachCandidate, type CoachReplyContext } from "./coach-conversation";
import { extractImageCandidates } from "./coach-image";
import { coachTextAnswer, coachTextConfigured } from "./coach-text-provider";
import { coachVisionConfiguration, createCoachVisionProvider } from "./coach-vision-provider";

export type ConversationActor = { id: string; timezone: string; language?: string };
type DB = Prisma.TransactionClient;
export const CONVERSATION_MESSAGE_LIMIT = 60;
const CONTEXT_MESSAGE_LIMIT = 16;
function coachCapabilities() { const externalAi = coachTextConfigured(), imageUnderstanding = coachVisionConfiguration().configured; return { externalAi, textProvider: externalAi ? "Google Gemini" : null, imageUnderstanding, imageProvider: imageUnderstanding ? "OpenAI" : null }; }
const SAFETY_RULES = ["urgent-symptoms", "illness-or-pain", "clarify-fatigue", "clarify-prior-safety", "clarify-symptom-timing", "clarify-current-symptoms", "unreviewed-image-urgent", "unreviewed-image-symptoms"];
const mutationFields: Record<string, readonly string[]> = {
  profile: ["goal", "weeklyHours", "weightKg"],
  workout_feedback: ["feedbackStatus", "actualDurationMin", "rpe", "actualSport"],
};
export type PendingAction = "review_checkin" | "review_plan";
export interface ConversationReceipt {
  id: string;
  proposalId: string;
  confirmedAt: string;
  applied: Array<{ candidateId: string; kind: string; field: string; value: CoachCandidate["value"]; sourceValue: CoachCandidate["value"]; source: string; observedDate: string | null; sessionId?: string; entityId: string; evidence: string }>;
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
  return { id: proposal.id, revision: proposal.revision, status: proposal.status, candidates, pendingActions: ["cancelled", "superseded"].includes(proposal.status) ? [] : receipt?.pendingActions ?? pendingActions(candidates), receipt, createdAt: proposal.createdAt };
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

async function readConversation(actor: ConversationActor, db: DB = prisma) {
  const conversation = await db.coachConversation.findUnique({ where: { userId: actor.id } });
  if (!conversation) return { conversation: { id: null, messages: [] }, proposal: null, receipt: null, pendingActions: [] as PendingAction[] };
  const [messages, proposal] = await Promise.all([
    db.coachConversationMessage.findMany({ where: { userId: actor.id, conversationId: conversation.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CONVERSATION_MESSAGE_LIMIT,
      select: { id: true, role: true, content: true, source: true, createdAt: true, metadata: true } }),
    db.coachConversationProposal.findFirst({ where: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
  ]);
  const proposalView = publicProposal(proposal);
  let suggested: PendingAction[] = [];
  const latestAssistant = messages.find(message => message.role === "assistant");
  try { const metadata = JSON.parse(latestAssistant?.metadata || "{}"); if (Array.isArray(metadata.pendingActions)) suggested = metadata.pendingActions.filter((action: unknown): action is PendingAction => action === "review_checkin" || action === "review_plan"); } catch { /* Unverified metadata grants no action. */ }
  return { conversation: { id: conversation.id, messages: messages.reverse().map(({ metadata, ...message }) => { let clientRequestId: string | undefined; try { const value = JSON.parse(metadata || "{}").clientRequestId; if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)) clientRequestId = value; } catch { /* Opaque request identity only. */ } return { ...message, ...(clientRequestId ? { clientRequestId } : {}) }; }) }, proposal: proposalView, receipt: proposalView?.receipt ?? null, pendingActions: [...new Set([...suggested, ...(proposalView?.pendingActions || [])])] };
}
export async function getConversation(actor: ConversationActor) {
  const today = dateKey(new Date(), actor.timezone);
  const [history, sessions] = await Promise.all([
    readConversation(actor),
    prisma.workout.findMany({ where: { userId: actor.id, date: { gte: localDate(addDaysKey(today, -30), actor.timezone), lt: localDate(addDaysKey(today, 8), actor.timezone) } },
      orderBy: [{ date: "desc" }, { id: "desc" }], take: 80, select: { id: true, title: true, sport: true, date: true, completed: true, feedbackStatus: true } }),
  ]);
  return { ok: true, ...history, capabilities: coachCapabilities(), localToday: today, sessions: sessions.map(session => ({ ...session, date: dateKey(session.date, actor.timezone) })) };
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

type RequestGuard = { id: string; conversationId: string; generation: number; revision: number; sessionRevision?: string };

/** Claim once before image decoding or provider work. This ledger stores only
 * hashes and operational state; clearing chat never preserves raw text here. */
export async function appendConversation(actor: ConversationActor, raw: unknown) {
  const body = object(raw);
  if (body.athleteId !== undefined && body.athleteId !== actor.id) throw new ApiError("Private assistant conversations are only available to their owner", 403);
  const input = parseAssistantInput(body);
  const selectedSessionId = body.sessionId == null || body.sessionId === "" ? undefined : identifier(body.sessionId, "session");
  const requestedConversationId = body.conversationId === undefined ? undefined : identifier(body.conversationId, "conversation");
  const namedExternal = (input.externalConsent && input.textProviderConsent === "gemini") || Boolean(input.image && input.imageConsent && input.imageProviderConsent === "openai");
  if (namedExternal && body.clientRequestId === undefined) throw new ApiError("An external request needs a stable clientRequestId before sending");
  const clientRequestId = body.clientRequestId === undefined ? randomUUID() : identifier(body.clientRequestId, "client request id");
  const requestHash = createHash("sha256").update(JSON.stringify({ input, sessionId: selectedSessionId ?? null, conversationId: requestedConversationId ?? null })).digest("hex");
  const metered = namedExternal || Boolean(input.image);
  let claim: { replayed: true } | { replayed: false; guard: RequestGuard };
  try {
    claim = await prisma.$transaction(async tx => {
      const now = new Date();
      const selected = selectedSessionId ? await tx.workout.findFirst({ where: { id: selectedSessionId, userId: actor.id } }) : null;
      if (selectedSessionId && !selected) throw new ApiError("Session not found", 404);
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
      return { replayed: false as const, guard: { id: row.id, conversationId: conversation.id, generation: conversation.generation, revision: conversation.revision, ...(selected ? { sessionRevision: workoutRevision(selected) } : {}) } };
    }, { isolationLevel: "Serializable" });
  } catch (error) { transactionError(error); }
  if (claim.replayed) {
    const history = await prisma.$transaction(tx => readConversation(actor, tx), { isolationLevel: "Serializable" });
    const lastAnswer = [...history.conversation.messages].reverse().find(message => message.role === "assistant");
    return { ...history, capabilities: coachCapabilities(), ok: true, replayed: true, mode: lastAnswer?.source === "gemini" ? "coach_ai" : "coach_local", answer: lastAnswer?.content ?? "", trainingModified: false, externalStatus: "not_requested", imageStatus: "not_requested" };
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
  const sessionId = body.sessionId == null || body.sessionId === "" ? undefined : identifier(body.sessionId, "session");
  const today = dayBounds(actor.timezone);
  let image: Awaited<ReturnType<typeof extractImageCandidates>> | null = null;
  try { if (input.image) image = await extractImageCandidates(input.image, { localToday: today.key, imageConsent: input.imageConsent, imageProviderConsent: input.imageProviderConsent, sessionId }, createCoachVisionProvider()); }
  catch (error) { throw new ApiError((error as Error).message); }
  try {
    const local = await prisma.$transaction(async tx => {
      const current = await tx.coachConversation.findUnique({ where: { userId: actor.id } });
      if (!current || current.id !== guard.conversationId || current.generation !== guard.generation || current.revision !== guard.revision) throw new ApiError("The conversation changed while this message was processing. Review the current conversation before sending again.", 409);
      const conversation = await tx.coachConversation.update({ where: { id: current.id, userId: actor.id }, data: { revision: { increment: 1 } } });
      const [messages, profile, setup, checkin, selected, planned, recentFeedback, safetyConcern] = await Promise.all([
        tx.coachConversationMessage.findMany({ where: { userId: actor.id, conversationId: conversation.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: CONTEXT_MESSAGE_LIMIT, select: { role: true, content: true, createdAt: true } }),
        tx.athleteProfile.findUnique({ where: { userId: actor.id } }),
        readPlanningSetup(actor.id, tx),
        tx.dailyCheckin.findUnique({ where: { userId_date: { userId: actor.id, date: today.start } } }),
        sessionId ? tx.workout.findFirst({ where: { id: sessionId, userId: actor.id } }) : Promise.resolve(null),
        tx.workout.findFirst({ where: { userId: actor.id, date: { gte: today.start, lt: today.end }, planned: true, completed: false, approved: true }, orderBy: [{ startTime: "asc" }, { id: "asc" }], include: { planDay: { select: { dayOff: true } } } }),
        tx.workout.findMany({ where: { userId: actor.id, date: { gte: localDate(addDaysKey(today.key, -30), actor.timezone), lt: today.end }, OR: [{ feedbackStatus: { not: null } }, { actualDurationMin: { not: null } }, { actualSport: { not: null } }, { rpe: { not: null } }] }, orderBy: [{ date: "desc" }, { id: "desc" }], take: 10, select: { date: true, feedbackStatus: true, actualDurationMin: true, actualSport: true, rpe: true } }),
        tx.coachConversationMessage.findFirst({ where: { userId: actor.id, conversationId: conversation.id, role: "assistant", OR: [...SAFETY_RULES.map(rule => ({ metadata: { contains: `\"ruleId\":\"coach-conversation-v1:${rule}\"` } })), { metadata: { contains: '"requiresCheckinReview":true' } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }),
      ]);
      if (sessionId && !selected) throw new ApiError("Session not found", 404);
      if (selected && guard.sessionRevision !== workoutRevision(selected)) throw new ApiError("The selected session changed while this message was processing. Review it before sending again.", 409);
      const sessionDate = selected ? dateKey(selected.date, actor.timezone) : undefined;
      let candidates: CoachCandidate[];
      try {
        candidates = validateCoachCandidates([
          ...extractLocalCandidates(input.message, { localToday: today.key, source: input.source, sessionId, sessionDate }),
          ...(image?.candidates ?? []),
        ], { localToday: today.key });
      } catch (error) { throw new ApiError((error as Error).message); }
      for (const candidate of candidates) {
        if (candidate.kind.startsWith("workout") && candidate.sessionId && candidate.sessionId !== selected?.id) throw new ApiError("Candidate session does not match your selected session");
        if (candidate.kind === "workout_feedback" && candidate.sessionId && (candidate.observedDate !== sessionDate || sessionDate! > today.key)) throw new ApiError("Feedback must match the selected session's date and cannot describe the future");
      }
      const planning = assessPlanningSetup(profile, setup.setup, new Date(), "daily");
      const effective = planned && planning.ready ? await effectivePrescription(actor.id, planned.id, tx) : null;
      let answers: Record<string, unknown> = {};
      if (checkin) { try { answers = object(JSON.parse(checkin.answers || "{}")); } catch { /* Fail closed without valid current safety answers. */ } }
      const unreviewedCurrentCheckin = candidates.some(candidate => candidate.kind === "checkin" && candidate.observedDate === today.key);
      const possibleCurrentSymptom = candidates.some(candidate => candidate.kind === "checkin" && ["sick", "newPain", "urgentSymptoms", "painAffectsMovement"].includes(candidate.field) && candidate.value === true);
      const context: CoachReplyContext = {
        localToday: today.key, language: actor.language, setupReady: planning.ready,
        unreviewedImageConcern: candidates.some(c => c.source === "image" && c.kind === "checkin" && c.field === "urgentSymptoms" && c.value === true) ? "urgent" : candidates.some(c => c.source === "image" && c.kind === "checkin" && ["sick", "newPain", "painAffectsMovement"].includes(c.field) && c.value === true) ? "symptom" : undefined,
        unresolvedSafetyConcernAt: possibleCurrentSymptom ? new Date().toISOString() : safetyConcern?.createdAt.toISOString() ?? null,
        profile: profile ? { goal: profile.goal, experience: profile.experience, weeklyHours: profile.weeklyHours, weightKg: profile.weightKg } : null,
        recentFeedback: recentFeedback.map(row => ({ ...row, date: dateKey(row.date, actor.timezone) })),
        recentMessages: messages.reverse().flatMap(message => message.role === "user" || message.role === "assistant" ? [{ role: message.role, content: message.content, createdAt: message.createdAt.toISOString() }] : []),
        checkin: checkin ? { ...answers, ...(profile?.injured ? { newPain: true } : {}), observedDate: today.key, recordedAt: (() => { const meta = answers.inputMetadata; if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null; const value = (meta as Record<string, unknown>).recordedAt; return typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now() ? value : null; })() } : undefined,
        approvedSession: !unreviewedCurrentCheckin && effective?.canonical.verdict === "ready" && planned ? { id: planned.id, title: planned.title, sport: planned.sport, durationMin: effective.canonical.durationMin, date: today.key, isRestDay: planned.planDay?.dayOff ?? false, hasWarmup: effective.canonical.steps.some(step => step.phase === "warmup"), approved: true } : undefined,
      };
      const reply = buildCoachReply(input.message, context);
      const suggestedActions: PendingAction[] = SAFETY_RULES.some(rule => reply.ruleId === `coach-conversation-v1:${rule}`) ? ["review_checkin"] : [];
      const clarifications = conversationClarifications(input.message, { localToday: today.key, source: input.source, sessionId, sessionDate });
      const answer = [reply.answer, candidates.length ? actor.language === "es" ? "Revisa los valores propuestos abajo. Aún no se ha guardado nada en tu perfil ni en tu entrenamiento." : "Review the proposed values below. Nothing has been saved to your profile or training yet." : "", ...clarifications, ...(image?.warnings ?? [])].filter(Boolean).join("\n\n");
      const userMessage = await tx.coachConversationMessage.create({ data: { conversationId: conversation.id, userId: actor.id, role: "user", content: input.message || "Image attached for review", source: input.image ? "image" : input.source,
        metadata: JSON.stringify({ clientRequestId: typeof body.clientRequestId === "string" ? body.clientRequestId : null, localDate: today.key, timezone: actor.timezone, sessionId: sessionId ?? null, externalConsent: input.externalConsent, textProviderConsent: input.textProviderConsent ?? null, imageConsent: input.imageConsent, imageProviderConsent: input.imageProviderConsent ?? null, imageStatus: image?.status ?? null }) } });
      if (candidates.length) {
        await tx.coachConversationProposal.updateMany({ where: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation, status: "pending" }, data: { status: "superseded", revision: { increment: 1 } } });
        await tx.coachConversationProposal.create({ data: { userId: actor.id, conversationId: conversation.id, generation: conversation.generation, sourceMessageId: userMessage.id, timezone: actor.timezone,
          candidates: JSON.stringify(candidates), baseRevisions: JSON.stringify({ profile: profileRevision(profile), workouts: selected ? { [selected.id]: { revision: workoutRevision(selected), date: sessionDate } } : {} }) } });
      }
      const assistantMessage = await tx.coachConversationMessage.create({ data: { conversationId: conversation.id, userId: actor.id, role: "assistant", content: answer, source: "local", metadata: JSON.stringify({ ruleId: reply.ruleId, sourceIds: reply.sourceIds ?? [], requiresCheckinReview: unreviewedCurrentCheckin, pendingActions: suggestedActions, imageStatus: image?.status ?? null }) } });
      return { ok: true, answer, mode: "coach_local", trainingModified: false, externalStatus: input.externalConsent ? "not_configured" : "not_requested", imageStatus: image?.status ?? "not_requested", capabilities: coachCapabilities(), ...await readConversation(actor, tx), _context: context, _guard: { conversationId: conversation.id, revision: conversation.revision, generation: conversation.generation, messageId: assistantMessage.id }, _ruleId: reply.ruleId, _hasCandidates: candidates.length > 0 };
    }, { isolationLevel: "Serializable", timeout: 20000 });
    const { _context, _guard, _ruleId, _hasCandidates, ...result } = local;
    // Network work never runs inside a database transaction. A concurrent clear,
    // confirmation or new message prevents late provider output replacing state.
    const provider = await coachTextAnswer({ message: input.message, localRuleId: _ruleId, context: _context, externalConsent: input.externalConsent, textProviderConsent: input.textProviderConsent, hasCandidates: _hasCandidates });
    if (!provider.answer) {
      const history = await prisma.$transaction(tx => readConversation(actor, tx), { isolationLevel: "Serializable" });
      const lastAnswer = [...history.conversation.messages].reverse().find(message => message.role === "assistant");
      return { ...result, ...history, answer: lastAnswer?.content ?? "", externalStatus: provider.status };
    }
    const disclosure = actor.language === "es" ? "Google Gemini seleccionó esta explicación educativa aprobada usando solo esta pregunta y tu idioma. La redacción procede de un catálogo limitado de la app. Los datos guardados y las decisiones de entrenamiento se responden localmente. No se guardó ningún cambio." : "Google Gemini selected this approved educational explanation using only this question and your language. Its wording comes from a bounded app catalog. Saved facts and coaching decisions stay local. No profile or training change was saved.";
    try {
      return await prisma.$transaction(async tx => {
        const current = await tx.coachConversation.findUnique({ where: { userId: actor.id } });
        if (!current || current.id !== _guard.conversationId || current.generation !== _guard.generation || current.revision !== _guard.revision) {
          const history = await readConversation(actor, tx);
          return { ...result, ...history, answer: [...history.conversation.messages].reverse().find(message => message.role === "assistant")?.content ?? "", externalStatus: "unavailable" };
        }
        const answer = `${provider.answer}\n\n${disclosure}`;
        const updated = await tx.coachConversationMessage.updateMany({ where: { id: _guard.messageId, userId: actor.id, conversationId: current.id }, data: { content: answer, source: "gemini", metadata: JSON.stringify({ ruleId: _ruleId, provider: "Google Gemini", namedConsent: "gemini", externalConsent: true }) } });
        if (updated.count !== 1) return { ...result, ...await readConversation(actor, tx), externalStatus: "unavailable" };
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
  try { valid = validateCoachCandidates(selected, { localToday }); } catch (error) { throw new ApiError((error as Error).message); }
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
    if (candidate.kind === "profile" || candidate.kind === "workout_feedback") {
      const destination = `${candidate.kind}:${candidate.sessionId || ""}:${candidate.field}`;
      if (destinations.has(destination)) throw new ApiError("Select only one value per saved field, even when observation dates differ");
      destinations.add(destination);
      if (!mutationFields[candidate.kind].includes(candidate.field)) throw new ApiError("This field cannot be applied from the conversation");
    }
    if (candidate.kind === "workout_feedback" && !candidate.sessionId) throw new ApiError("Choose the session and send this report again before saving");
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
        return { ...await readConversation(actor, tx), ok: true, replayed: true, applied: receipt.applied.length > 0, trainingModified: false, prescriptionModified: false, profileModified: receipt.applied.some(c => c.kind === "profile"), actualsModified: receipt.applied.some(c => c.kind === "workout_feedback"), receipt, pendingAction: receipt.pendingActions[0] ?? null, pendingActions: receipt.pendingActions };
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
        if (candidate.kind === "workout_feedback") {
          const base = bases.workouts[candidate.sessionId!];
          if (!base || candidate.observedDate !== base.date || base.date > today) throw new ApiError("Session and observation date must match the original proposal", 409);
          const fields = workoutFields.get(candidate.sessionId!) ?? {};
          fields[candidate.field] = candidate.value;
          workoutFields.set(candidate.sessionId!, fields);
        }
      }
      const entityIds = new Map<string, string>();
      const reason = `Athlete confirmed private assistant proposal ${proposal.id}; source message ${proposal.sourceMessageId}; immutable provenance in coach.conversation.confirmed audit`;
      if (Object.keys(profileFields).length) {
        const saved = await saveProfile(actor.id, actor, { ...profileFields, expectedRevision: bases.profile, reason }, tx);
        entityIds.set("profile", saved.id);
      }
      for (const [sessionId, fields] of workoutFields) {
        const existing = await tx.workout.findFirst({ where: { id: sessionId, userId: actor.id } });
        const base = bases.workouts[sessionId];
        if (!existing || dateKey(existing.date, actor.timezone) !== base.date || workoutRevision(existing) !== base.revision) throw new ApiError("The session changed since this proposal. Send a new message and review it again.", 409);
        const saved = await updateWorkout(actor.id, actor, { ...fields, sessionId, expectedRevision: base.revision, reason }, tx);
        entityIds.set(sessionId, saved.id);
      }
      const applied = selected.filter(c => c.kind === "profile" || c.kind === "workout_feedback").map(candidate => ({ candidateId: candidate.id, kind: candidate.kind, field: candidate.field, value: candidate.value, sourceValue: stored.find(c => c.id === candidate.id)!.value, source: candidate.source, observedDate: candidate.observedDate, ...(candidate.sessionId ? { sessionId: candidate.sessionId } : {}), entityId: entityIds.get(candidate.kind === "profile" ? "profile" : candidate.sessionId!)!, evidence: candidate.evidence }));
      const actions = pendingActions(selected, applied.length > 0);
      const receipt: ConversationReceipt = { id: randomUUID(), proposalId, confirmedAt: new Date().toISOString(), applied, pendingActions: actions, checkinDraft: selected.filter(c => c.kind === "checkin"), planDraft: selected.filter(c => c.kind === "workout_plan"),
        message: actor.language === "es" ? applied.length ? "Se guardaron los valores confirmados del perfil o del trabajo realizado. Revisa el check-in de hoy para reevaluar el entrenamiento. No se han reescrito las sesiones de hoy ni las futuras." : "Estos valores aún necesitan revisión en el check-in o la vista previa del plan. No se ha guardado ningún cambio en el perfil, el check-in ni el entrenamiento." : applied.length ? "Confirmed profile or actual-work values saved. Review today's check-in to reassess training. Daily and future prescriptions have not been rewritten." : "These values still need review in the check-in or plan preview. No profile, check-in, or training change has been saved." };
      await tx.coachConversationProposal.update({ where: { id: proposal.id, userId: actor.id }, data: { status: applied.length ? "confirmed" : "review_required", revision: { increment: 1 }, idempotencyKey, requestHash, receipt: JSON.stringify(receipt), confirmedAt: new Date(receipt.confirmedAt) } });
      if (applied.length) await tx.auditLog.create({ data: { id: receipt.id, actorId: actor.id, subjectId: actor.id, action: "coach.conversation.confirmed", entityId: proposal.id, before: JSON.stringify({ candidates: stored.filter(c => applied.some(a => a.candidateId === c.id)).map(({ evidence: _chatText, warnings: _chatWarnings, ...facts }) => facts), sourceMessageId: proposal.sourceMessageId, baseRevisions: bases }), after: JSON.stringify({ ...receipt, applied: receipt.applied.map(({ evidence: _chatText, ...facts }) => facts), checkinDraft: [], planDraft: [] }), note: `Athlete-confirmed ${actor.timezone}; profile and reported actuals only; no automatic plan rewrite` } });
      await tx.coachConversationMessage.create({ data: { userId: actor.id, conversationId: conversation.id, role: "assistant", source: "local", content: receipt.message, metadata: JSON.stringify({ proposalId, receiptId: receipt.id, applied: applied.length > 0 }) } });
      await tx.coachConversation.update({ where: { id: conversation.id, userId: actor.id }, data: { revision: { increment: 1 } } });
      return { ...await readConversation(actor, tx), ok: true, applied: applied.length > 0, trainingModified: false, prescriptionModified: false, profileModified: applied.some(c => c.kind === "profile"), actualsModified: applied.some(c => c.kind === "workout_feedback"), receipt, pendingAction: actions[0] ?? null, pendingActions: actions };
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
