import { sendTelegramCoaching, telegramCoachingConfigured, parseTelegramUpdate, boundedTelegramMessage } from "./telegram-coaching-transport";
import type { CommunicationPreference, CoachingPrompt, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./access";
import { effectivePrescription } from "./effective-prescription";
import { updateWorkout, workoutRevision } from "./workout-update";
import { readPlanningSetup } from "./planning-setup-store";
import { assessPlanningSetup } from "./planning-setup";
import { resolveCheckinSafety } from "./checkin-safety";
import { dateKey, dayBounds, localDate, addDaysKey } from "./dates";
import { stepEndpointLabel } from "./plan-formats";
import { CONSENT_VERSION, TELEGRAM_CONSENT_VERSION, PURPOSES, mockCoachingEnabled, parseCommunicationSettings, newReplyToken, tokenMatches,
  hashToken, promptKey, missingDataQuestions, parseCoachingReply, validateCandidate, verifyReplyBinding, mockTransport,
  inQuietHours, localMinute, dueSchedule, type Purpose, type CommunicationSettings, type MockOutcome, type MissingQuestion } from "./coaching-communication";

export type CoachingActor = { id: string; timezone: string; email: string };
export function requireMockCoaching() {
  if (!mockCoachingEnabled()) throw new ApiError("Optional coaching delivery is disabled. Real Telegram/email transport needs privacy and provider review. Manual check-in remains available.", 503);
}
export function coachingMode(): "mock" | "telegram" {
  if (mockCoachingEnabled()) return "mock";
  if (telegramCoachingConfigured()) return "telegram";
  throw new ApiError("Coaching delivery is disabled or unconfigured. Manual check-in remains available.", 503);
}
function currentConsentVersion() { return telegramCoachingConfigured() ? TELEGRAM_CONSENT_VERSION : CONSENT_VERSION; }
function parseStored<T>(text: string | null | undefined, fallback: T): T { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } }
export function publicPreference(pref: CommunicationPreference | null, timezone: string) {
  return { primaryChannel: pref?.primaryChannel || "app", paused: pref?.paused ?? true, dailyPlan: pref?.dailyPlan ?? false,
    sessionFeedback: pref?.sessionFeedback ?? false, missingData: pref?.missingData ?? false, timezone: pref?.timezone || timezone,
    minuteOfDay: pref?.minuteOfDay ?? 1020, quietStart: pref?.quietStart ?? 1260, quietEnd: pref?.quietEnd ?? 420,
    declinedOptional: parseStored<string[]>(pref?.declinedOptional, []),
    verifiedChatId: pref?.verifiedChatId ?? null, verifiedActorId: pref?.verifiedActorId ?? null,
    verifiedEmail: pref?.verifiedEmail ?? null, verifiedAt: pref?.verifiedAt ?? null,
    verificationTransport: pref?.verificationTransport ?? null, consentVersion: pref?.consentVersion ?? null };
}
function settingsFor(pref: CommunicationPreference): CommunicationSettings {
  return parseCommunicationSettings({ ...Object.fromEntries(["primaryChannel", "paused", ...PURPOSES, "timezone", "minuteOfDay", "quietStart", "quietEnd"].map(k => [k, pref[k as keyof CommunicationPreference]])),
    declinedOptional: parseStored(pref.declinedOptional, []), consentVersion: pref.consentVersion });
}
function assertConsent(pref: CommunicationPreference | null, purpose: Purpose, transport: "mock" | "telegram" = "mock") {
  if (!pref || pref.paused || !pref[purpose] || pref.consentVersion !== (transport === "telegram" ? TELEGRAM_CONSENT_VERSION : CONSENT_VERSION)) throw new ApiError(`Opt in to ${purpose} and unpause the selected channel first.`, 409);
  if (pref.primaryChannel === "telegram" && (!pref.verifiedChatId || !pref.verifiedActorId || !pref.verifiedAt || pref.verificationTransport !== transport)) throw new ApiError("Verify your private Telegram chat for the selected transport first.", 409);
  if (pref.primaryChannel === "email" && (!pref.verifiedEmail || !pref.verifiedAt || pref.verificationTransport !== transport)) throw new ApiError("Verify the synthetic email flow first.", 409);
  return pref;
}
export async function saveCommunicationSettings(actor: CoachingActor, value: unknown) {
  let settings: CommunicationSettings;
  try { settings = parseCommunicationSettings(value); } catch (e) { throw new ApiError((e as Error).message); }
  if (PURPOSES.some(k => settings[k]) && (value as Record<string, unknown>).consentVersion !== currentConsentVersion()) throw new ApiError("Review the purposes for the current transport before opting in");
  return prisma.$transaction(async tx => {
    const old = await tx.communicationPreference.findUnique({ where: { userId: actor.id } });
    // Verification is checked when opting in, not when merely selecting a paused channel.
    if (!settings.paused && PURPOSES.some(k => settings[k])) assertConsent({ ...old, ...settings,
      verifiedEmail: old?.verifiedEmail === actor.email ? old.verifiedEmail : null,
      declinedOptional: JSON.stringify(settings.declinedOptional), consentVersion: currentConsentVersion() } as CommunicationPreference, PURPOSES.find(k => settings[k])!, telegramCoachingConfigured() ? "telegram" : "mock");
    const data = { ...settings, declinedOptional: JSON.stringify(settings.declinedOptional), consentVersion: currentConsentVersion(), consentAt: new Date() };
    const pref = await tx.communicationPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id, ...data }, update: data });
    // New consent choices invalidate old capabilities. Confirmed audit/history remains.
    await tx.coachingPrompt.updateMany({ where: { userId: actor.id, replyStatus: { in: ["none", "pending"] } },
      data: { status: "cancelled", tokenHash: null, tokenExpiresAt: null, error: "Communication preferences changed. Use the app to review the current session." } });
    await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: "communication.consent", before: JSON.stringify(old ? publicPreference(old, actor.timezone) : null), after: JSON.stringify(publicPreference(pref, actor.timezone)) } });
    return publicPreference(pref, actor.timezone);
  }, { isolationLevel: "Serializable" });
}
export async function startMockPairing(actor: CoachingActor) {
  requireMockCoaching();
  const challenge = newReplyToken();
  await prisma.communicationPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id, timezone: actor.timezone,
    challengeHash: challenge.hash, challengeExpiresAt: challenge.expiresAt }, update: { challengeHash: challenge.hash, challengeExpiresAt: challenge.expiresAt } });
  return { token: challenge.token, expiresAt: challenge.expiresAt, transport: "mock", warning: "Synthetic verification only. No Telegram or email account was contacted or verified." };
}
export async function finishMockPairing(actor: CoachingActor, input: Record<string, unknown>) {
  requireMockCoaching();
  if (typeof input.channel !== "string" || !["telegram", "email"].includes(input.channel)) throw new ApiError("Choose Telegram or email");
  if (input.channel === "telegram" && (input.chatType !== "private" || typeof input.actorId !== "string" || typeof input.chatId !== "string" || !/^\d{1,20}$/.test(input.actorId) || input.actorId !== input.chatId)) throw new ApiError("A matching sender and private chat are required");
  if (input.channel === "email" && input.email !== actor.email) throw new ApiError("Email must match this signed-in athlete");
  return prisma.$transaction(async tx => {
    const pref = await tx.communicationPreference.findUnique({ where: { userId: actor.id } });
    if (!pref?.challengeExpiresAt || pref.challengeExpiresAt <= new Date() || !tokenMatches(input.token, pref.challengeHash)) throw new ApiError("Pairing challenge expired or was already used", 409);
    const result = await tx.communicationPreference.updateMany({ where: { userId: actor.id, challengeHash: pref.challengeHash }, data: {
      ...(input.channel === "telegram" ? { verifiedActorId: String(input.actorId), verifiedChatId: String(input.chatId) } : { verifiedEmail: actor.email }),
      verifiedAt: new Date(), verificationTransport: "mock", challengeHash: null, challengeExpiresAt: null,
    } });
    if (result.count !== 1) throw new ApiError("Pairing challenge already used", 409);
    await tx.coachingPrompt.updateMany({ where: { userId: actor.id, replyStatus: { in: ["none", "pending"] } }, data: { status: "cancelled", tokenHash: null, tokenExpiresAt: null } });
    await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: "communication.mock-verification", after: JSON.stringify({ channel: input.channel, transport: "mock" }) } });
    return { ok: true, verified: "synthetic-only", transport: "mock", enabled: false };
  }, { isolationLevel: "Serializable" });
}
function publicPrompt(prompt: CoachingPrompt) {
  const { tokenHash: _tokenHash, candidate, questions, ...rest } = prompt;
  return { ...rest, candidate: parseStored(candidate, null), questions: parseStored<MissingQuestion[]>(questions, []), readAt: null, externallySent: prompt.transport === "telegram" && prompt.status === "sent" };
}
async function promptQuestions(tx: Prisma.TransactionClient, actor: CoachingActor, resolved: NonNullable<Awaited<ReturnType<typeof effectivePrescription>>>, pref: CommunicationPreference) {
  const [checkin, setup, profile] = await Promise.all([
    tx.dailyCheckin.findUnique({ where: { userId_date: { userId: actor.id, date: dayBounds(actor.timezone).start } } }),
    readPlanningSetup(actor.id, tx), tx.athleteProfile.findUnique({ where: { userId: actor.id } }),
  ]);
  const safety = resolveCheckinSafety(parseStored(checkin?.answers, null));
  const planning = assessPlanningSetup(profile, setup.setup, new Date(), "daily");
  const p = resolved.targetProfile;
  const hasAnchor = Boolean(resolved.canonical.sport === "run" ? p?.runPaceBase : resolved.canonical.sport === "bike" ? p?.ftp : p?.swimPaceBase);
  return missingDataQuestions({ ...resolved.workout, sport: resolved.canonical.sport, hasAnchor,
    missingSafety: safety.missingFields, planningMissing: planning.missing, declinedOptional: parseStored(pref.declinedOptional, []) });
}
function promptMessage(resolved: NonNullable<Awaited<ReturnType<typeof effectivePrescription>>>, purpose: Purpose, questions: MissingQuestion[], transport: "mock" | "telegram") {
  const c = resolved.canonical;
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit");
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) throw new ApiError("Invalid application origin");
  const path = `${origin.origin}/daily?sessionId=${encodeURIComponent(c.id)}`;
  // Exclude health/restriction reasons, free-form notes, name and body measurements.
  const lines = [`JMM ${c.sport} · ${c.dateLocal}`];
  if (purpose === "dailyPlan") {
    if (c.verdict !== "ready") lines.push("No cleared workout is available. Review your current plan and check-in in the app.");
    else lines.push("Before: review equipment, venue and full preparation/fueling guidance in the app.",
      "During: follow the selected session's exact blocks; stop if unwell or in pain.",
      ...c.steps.slice(0, 12).map((s, i) => `${i + 1}. ${s.phase}: ${stepEndpointLabel(s)} · ${s.target.label}`),
      ...(c.steps.length > 12 ? [`${c.steps.length - 12} further blocks are shown in the app; this is a concise summary, not the complete workout.`] : []),
      "After: cool down as prescribed, choose familiar food/fluid according to need, and report actual minutes and effort. Avoid overdrinking.");
  } else {
    for (const q of questions.filter(q => !q.appOnly)) lines.push(`${q.question} ${q.consequence}`);
    if (questions.some(q => q.appOnly)) lines.push("Additional private questions are available in the app. No sensitive answers are requested in this message.");
    if (questions.some(q => ["status", "minutes", "rpe"].includes(q.key))) lines.push("Reply directly to this message with labeled fields: status=completed; minutes=30; rpe=5; sport=run. Values are examples, not your report. Unknown is allowed. Confirm/edit in the app before anything affects training.");
  }
  lines.push(`Open authenticated app: ${path}`, `Pause or unsubscribe: ${origin.origin}/reminders`, transport === "mock" ? "MOCK ONLY: no external message sent, no read receipt." : "Provider acceptance does not establish reading or completion.");
  return lines.join("\n");
}
export async function createCoachingPrompt(actor: CoachingActor, input: { sessionId: string; purpose: Purpose; mockOutcome?: MockOutcome }, now = new Date(), dependencies: { sendTelegram?: typeof sendTelegramCoaching } = {}) {
  const transport = coachingMode();
  if (transport !== "mock" && input.mockOutcome !== undefined) throw new ApiError("Mock outcomes cannot be supplied to the real transport");
  if (!PURPOSES.includes(input.purpose) || typeof input.sessionId !== "string" || !input.sessionId || input.sessionId.length > 120) throw new ApiError("Select a session and communication purpose");
  if (input.mockOutcome !== undefined && !["accepted", "failed", "unknown"].includes(input.mockOutcome)) throw new ApiError("Unknown mock outcome");
  const created = await prisma.$transaction(async tx => {
    const pref = assertConsent(await tx.communicationPreference.findUnique({ where: { userId: actor.id } }), input.purpose, transport);
    if (transport === "telegram" && pref.primaryChannel !== "telegram") throw new ApiError("Real email and app push are not enabled; select verified Telegram or use the app directly", 409);
    if (pref.primaryChannel === "email" && pref.verifiedEmail !== actor.email) throw new ApiError("Email changed; verify again", 409);
    if (inQuietHours(localMinute(now, pref.timezone), pref.quietStart, pref.quietEnd)) throw new ApiError("Quiet hours are active; this prompt was not delivered", 409);
    const resolved = await effectivePrescription(actor.id, input.sessionId, tx);
    if (!resolved) throw new ApiError("Session not found", 404);
    const observationDate = dateKey(resolved.workout.date, actor.timezone);
    if (input.purpose === "sessionFeedback" && observationDate > dateKey(now, actor.timezone)) throw new ApiError("A future session cannot have an execution report yet", 422);
    const key = promptKey(actor.id, input.purpose, input.sessionId, observationDate);
    const existing = await tx.coachingPrompt.findUnique({ where: { idempotencyKey: key } });
    if (existing && existing.status !== "failed") return { prompt: publicPrompt(existing), duplicate: true, replyToken: null };
    if (existing && (existing.attempts >= 3 || !existing.nextAttemptAt || existing.nextAttemptAt > now)) throw new ApiError("Definite-failure retry is not due or the attempt limit is reached", 409);
    if (existing && existing.sourceRevision !== resolved.canonical.revision) throw new ApiError("Session changed since the failed attempt; review the current session in the app", 409);
    const today = dayBounds(pref.timezone, now);
    const count = await tx.coachingPrompt.count({ where: { userId: actor.id, createdAt: { gte: today.start, lt: today.end } } });
    if (!existing && count >= 3) throw new ApiError("Daily limit of three coaching prompts reached. Use the app directly.", 429);
    let questions = await promptQuestions(tx, actor, resolved, pref);
    if (input.purpose === "missingData" && !resolved.workout.feedbackStatus && observationDate >= dateKey(now, actor.timezone)) questions = questions.filter(q => !["status", "minutes", "rpe"].includes(q.key));
    if (input.purpose === "sessionFeedback") questions = questions.filter(q => ["status", "minutes", "rpe"].includes(q.key));
    if (input.purpose !== "dailyPlan" && !questions.length) throw new ApiError("No missing decision inputs need a question for this session", 422);
    const token = input.purpose === "dailyPlan" || !questions.some(q => ["status", "minutes", "rpe"].includes(q.key)) ? null : newReplyToken(now);
    const result = transport === "mock" ? mockTransport(input.mockOutcome) : { status: "pending", receiptId: null, error: null };
    const attempts = (existing?.attempts || 0) + 1;
    const data = { userId: actor.id, sessionId: input.sessionId, purpose: input.purpose, channel: pref.primaryChannel,
      transport, observationDate, timezone: actor.timezone, sourceRevision: resolved.canonical.revision, sourceWorkoutRevision: workoutRevision(resolved.workout),
      idempotencyKey: key, questions: JSON.stringify(questions), message: promptMessage(resolved, input.purpose, questions, transport),
      ...result, attempts, lastAttemptAt: now, nextAttemptAt: result.status === "failed" && attempts < 3 ? new Date(now.getTime() + 60_000 * 2 ** (attempts - 1)) : null,
      tokenHash: ["simulated", "pending"].includes(result.status) ? token?.hash : null, tokenExpiresAt: ["simulated", "pending"].includes(result.status) ? token?.expiresAt : null };
    const prompt = existing ? await tx.coachingPrompt.update({ where: { id: existing.id }, data }) : await tx.coachingPrompt.create({ data });
    await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: transport === "mock" ? "communication.mock-attempt" : "communication.telegram-attempt", entityId: prompt.id,
      after: JSON.stringify({ purpose: input.purpose, channel: pref.primaryChannel, status: result.status, attempts, receiptId: result.receiptId, sourceRevision: prompt.sourceRevision }) } });
    return { prompt: publicPrompt(prompt), duplicate: false, replyToken: ["simulated", "pending"].includes(result.status) ? token?.token ?? null : null, privateRecipient: pref.verifiedChatId };
  }, { isolationLevel: "Serializable", timeout: 15000 });
  if (transport === "mock" || created.duplicate) {
    const { privateRecipient: _recipient, ...result } = created as typeof created & { privateRecipient?: string | null };
    return result;
  }
  // Recheck consent and the canonical source immediately before the network
  // boundary. A revoked/changed pending claim must never be sent as old work.
  await prisma.$transaction(async tx => {
    const [pending, pref, fresh] = await Promise.all([
      tx.coachingPrompt.findUnique({ where: { id: created.prompt.id } }),
      tx.communicationPreference.findUnique({ where: { userId: actor.id } }),
      effectivePrescription(actor.id, created.prompt.sessionId, tx),
    ]);
    assertConsent(pref, input.purpose, "telegram");
    if (!pending || pending.status !== "pending" || pref!.verifiedChatId !== created.privateRecipient || !fresh || fresh.canonical.revision !== created.prompt.sourceRevision || inQuietHours(localMinute(new Date(), pref!.timezone), pref!.quietStart, pref!.quietEnd)) throw new ApiError("Pending delivery changed or quiet hours started. No external request was sent.", 409);
  }, { isolationLevel: "Serializable", timeout: 15000 });
  const result = await (dependencies.sendTelegram || sendTelegramCoaching)(created.privateRecipient!, boundedTelegramMessage(created.prompt.message), { expectsReply: Boolean(created.replyToken) });
  const prompt = await finalizeTelegramAttempt(created.prompt.id, actor.id, result);
  return { prompt: publicPrompt(prompt), duplicate: false, replyToken: null };
}
export async function receiveCoachingReply(actor: CoachingActor, input: Record<string, unknown>, now = new Date(), transport: "mock" | "telegram" = "mock", trustedReceiptId?: string, transaction?: Prisma.TransactionClient) {
  if (transport === "mock") requireMockCoaching(); else if (!telegramCoachingConfigured()) throw new ApiError("Telegram coaching disabled", 503);
  for (const key of ["promptId", "sessionId", "observationDate", "sourceRevision", "timezone", "actorId", "chatId", ...(trustedReceiptId ? [] : ["token"])]) if (typeof input[key] !== "string") throw new ApiError(`Invalid ${key}`);
  let candidate; try { candidate = parseCoachingReply(input.text); } catch (e) { throw new ApiError((e as Error).message); }
  const apply = async (tx: Prisma.TransactionClient) => {
    const prompt = await tx.coachingPrompt.findFirst({ where: { id: String(input.promptId || ""), userId: actor.id } });
    if (!prompt) throw new ApiError("Prompt not found", 404);
    if (prompt.purpose === "dailyPlan") throw new ApiError("This reminder does not accept replies");
    const pref = assertConsent(await tx.communicationPreference.findUnique({ where: { userId: actor.id } }), prompt.purpose as Purpose, transport);
    if (trustedReceiptId && (transport !== "telegram" || prompt.receiptId !== trustedReceiptId || prompt.status !== "sent")) throw new ApiError("Reply does not refer to the accepted coaching message", 409);
    if (prompt.transport !== transport) throw new ApiError("Reply transport does not match", 409);
    if (pref.primaryChannel !== prompt.channel) throw new ApiError("Primary channel changed", 409);
    const resolved = await effectivePrescription(actor.id, prompt.sessionId, tx);
    if (!resolved || resolved.canonical.revision !== prompt.sourceRevision || actor.timezone !== prompt.timezone || dateKey(resolved.workout.date, actor.timezone) !== prompt.observationDate) throw new ApiError("Session/date/revision changed. Review the current session in the app.", 409);
    const verifiedActorId = pref.primaryChannel === "telegram" ? pref.verifiedActorId! : actor.id;
    const verifiedChatId = pref.primaryChannel === "telegram" ? pref.verifiedChatId! : pref.primaryChannel === "email" ? pref.verifiedEmail! : actor.id;
    try { verifyReplyBinding(prompt, { userId: actor.id, sessionId: String(input.sessionId), observationDate: String(input.observationDate),
      sourceRevision: String(input.sourceRevision), timezone: String(input.timezone), token: input.token,
      actorId: String(input.actorId), chatId: String(input.chatId), verifiedActorId, verifiedChatId }, now, Boolean(trustedReceiptId)); } catch (e) { throw new ApiError((e as Error).message, 409); }
    const used = await tx.coachingPrompt.updateMany({ where: { id: prompt.id, tokenUsedAt: null, replyStatus: "none", tokenHash: prompt.tokenHash },
      data: { tokenUsedAt: now, tokenHash: null, replyStatus: "pending", repliedAt: now, candidate: JSON.stringify(candidate) } });
    if (used.count !== 1) throw new ApiError("Reply token already used", 409);
    await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: "coaching.reply.received", entityId: prompt.id,
      after: JSON.stringify({ source: `${transport}_reply`, sessionId: prompt.sessionId, observationDate: prompt.observationDate, sourceRevision: prompt.sourceRevision, candidateFields: Object.keys(candidate), applied: false }) } });
    return { ok: true, applied: false, requiresConfirmation: true, candidate, promptId: prompt.id, appPath: "/reminders" };
  };
  return transaction ? apply(transaction) : prisma.$transaction(apply, { isolationLevel: "Serializable", timeout: 15000 });
}
export async function confirmCoachingReply(actor: CoachingActor, input: Record<string, unknown>) {
  if (typeof input.action !== "string" || !["confirm", "dismiss"].includes(input.action)) throw new ApiError("Choose confirm or dismiss");
  return prisma.$transaction(async tx => {
    const prompt = await tx.coachingPrompt.findFirst({ where: { id: String(input.promptId || ""), userId: actor.id } });
    if (!prompt) throw new ApiError("Prompt not found", 404);
    if (prompt.replyStatus !== "pending" || !["simulated", "sent"].includes(prompt.status)) throw new ApiError("This answer is no longer pending", 409);
    if (input.action === "confirm" && (!prompt.repliedAt || Date.now() - prompt.repliedAt.getTime() >= 7 * 86400_000)) throw new ApiError("This draft expired. Review the session in the app.", 409);
    if (input.action === "dismiss") {
      await tx.coachingPrompt.update({ where: { id: prompt.id }, data: { replyStatus: "dismissed", candidate: null } });
      await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: "coaching.reply.dismissed", entityId: prompt.id } });
      return { ok: true, applied: false };
    }
    let candidate; try { candidate = validateCandidate(input.candidate); } catch (e) { throw new ApiError((e as Error).message); }
    const resolved = await effectivePrescription(actor.id, prompt.sessionId, tx);
    if (!resolved || input.expectedRevision !== prompt.sourceRevision || resolved.canonical.revision !== prompt.sourceRevision || prompt.timezone !== actor.timezone || dateKey(resolved.workout.date, actor.timezone) !== prompt.observationDate) throw new ApiError("Session/date/revision changed. Dismiss this draft and review the current session.", 409);
    await updateWorkout(actor.id, actor, { sessionId: prompt.sessionId, expectedRevision: prompt.sourceWorkoutRevision,
      feedbackStatus: candidate.status, actualDurationMin: candidate.minutes, rpe: candidate.rpe, actualSport: candidate.sport,
      reason: `Confirmed editable reply ${prompt.id}; observed ${prompt.observationDate} (${prompt.timezone}); source revision ${prompt.sourceRevision}` }, tx);
    const pref = await tx.communicationPreference.findUnique({ where: { userId: actor.id } });
    if (pref && candidate.declinedOptional.length) await tx.communicationPreference.update({ where: { userId: actor.id }, data: {
      declinedOptional: JSON.stringify([...new Set([...parseStored<string[]>(pref.declinedOptional, []), ...candidate.declinedOptional])]) } });
    await tx.coachingPrompt.update({ where: { id: prompt.id }, data: { replyStatus: "confirmed", confirmedAt: new Date(), candidate: JSON.stringify(candidate) } });
    await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: "coaching.reply.confirmed", entityId: prompt.id,
      before: prompt.candidate, after: JSON.stringify({ candidate, source: `athlete_confirmed_${prompt.transport}_reply`, observationDate: prompt.observationDate,
        timezone: prompt.timezone, sessionId: prompt.sessionId, sourceRevision: prompt.sourceRevision }) } });
    return { ok: true, applied: true, needsCheckin: true, message: "Confirmed actuals saved. Update today's check-in to reassess training; no automatic progression was applied." };
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
export async function listCoachingPrompts(userId: string) {
  await prisma.coachingPrompt.updateMany({ where: { userId, replyStatus: "pending", repliedAt: { lt: new Date(Date.now() - 7 * 86400_000) } }, data: { candidate: null, replyStatus: "expired", tokenHash: null } });
  return (await prisma.coachingPrompt.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 })).map(publicPrompt);
}
export async function runMockCoachingSchedule(now = new Date()) {
  const transport = coachingMode();
  await reconcileCoachingAttempts(now);
  const prefs = await prisma.communicationPreference.findMany({ where: { paused: false, OR: PURPOSES.map(purpose => ({ [purpose]: true })) }, include: { user: true } });
  const results: Array<{ userId: string; sessionId?: string; purpose?: string; status: string; error?: string }> = [];
  // Do not retain unconfirmed candidates indefinitely. Audits keep provenance;
  // raw incoming text and audio are never stored by this flow.
  await prisma.coachingPrompt.updateMany({ where: { replyStatus: "pending", repliedAt: { lt: new Date(now.getTime() - 7 * 86400_000) } }, data: { candidate: null, replyStatus: "expired", tokenHash: null } });
  for (const pref of prefs) {
    const schedule = dueSchedule(settingsFor(pref), now); if (!schedule) continue;
    const workouts = await prisma.workout.findMany({ where: { userId: pref.userId, date: {
      gte: localDate(addDaysKey(schedule.day, -1), pref.user.timezone), lt: localDate(addDaysKey(schedule.day, 1), pref.user.timezone) } }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    for (const w of workouts) for (const purpose of PURPOSES) {
      if (!pref[purpose] || (purpose === "sessionFeedback" ? dateKey(w.date, pref.user.timezone) === schedule.day : dateKey(w.date, pref.user.timezone) !== schedule.day)) continue;
      try { const result = await createCoachingPrompt(pref.user, { sessionId: w.id, purpose }, now);
        results.push({ userId: pref.userId, sessionId: w.id, purpose, status: result.duplicate ? "duplicate-skipped" : result.prompt.status });
      } catch (e) { results.push({ userId: pref.userId, sessionId: w.id, purpose, status: "blocked", error: (e as Error).message }); }
    }
  }
  return { transport, externallySent: results.filter(r => r.status === "sent").length, simulated: results.filter(r => r.status === "simulated").length, results };
}


export async function startTelegramPairing(actor: CoachingActor) {
  if (!telegramCoachingConfigured()) throw new ApiError("Telegram coaching disabled", 503);
  const username = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || "";
  // Existing verified chats can still receive opted-in messages, but a new link
  // must never report success without a usable, configured pairing destination.
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username))
    throw new ApiError("Telegram linking is not configured. Ask the administrator to configure the bot username; no pairing request was created.", 503);
  const token = newReplyToken();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await prisma.communicationPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id, timezone: actor.timezone, challengeHash: token.hash, challengeExpiresAt: expiresAt }, update: { challengeHash: token.hash, challengeExpiresAt: expiresAt } });
  return { transport: "telegram", token: token.token, expiresAt, pairingUrl: `https://t.me/${username}?start=${token.token}`, enabled: false };
}
export async function processTelegramWebhook(value: unknown, now = new Date()) {
  if (!telegramCoachingConfigured()) throw new ApiError("Telegram coaching disabled", 503);
  let update; try { update = parseTelegramUpdate(value, now); } catch (e) { throw new ApiError((e as Error).message); }
  try { return await prisma.$transaction(async tx => {
    const id = String(update.updateId);
    const previous = await tx.telegramCoachingUpdate.findUnique({ where: { id } });
    if (previous && previous.status !== "processing") return { ok: true, duplicate: true };
    if (!previous) await tx.telegramCoachingUpdate.create({ data: { id } });
    // Claim, draft/pairing and receipt commit together. Transient failures
    // roll everything back so Telegram can safely retry the same update.
    if (update.kind === "pair") {
      const pref = await tx.communicationPreference.findFirst({ where: { challengeHash: hashToken(update.token), challengeExpiresAt: { gt: now } } });
      if (!pref) throw new ApiError("Pairing challenge invalid, expired or already used", 409);
      const paired = await tx.communicationPreference.updateMany({ where: { userId: pref.userId, challengeHash: pref.challengeHash }, data: {
        verifiedChatId: update.chatId, verifiedActorId: update.actorId, verifiedAt: now, verificationTransport: "telegram",
        challengeHash: null, challengeExpiresAt: null, paused: true, dailyPlan: false, sessionFeedback: false, missingData: false, consentVersion: null, consentAt: null,
      } });
      if (paired.count !== 1) throw new ApiError("Pairing challenge already used", 409);
      await tx.coachingPrompt.updateMany({ where: { userId: pref.userId, replyStatus: { in: ["none", "pending"] } }, data: { status: "cancelled", tokenHash: null, tokenExpiresAt: null } });
      await tx.auditLog.create({ data: { actorId: pref.userId, subjectId: pref.userId, action: "communication.telegram-verified", after: JSON.stringify({ transport: "telegram", updateId: update.updateId, optedIn: false }) } });
      await tx.telegramCoachingUpdate.update({ where: { id }, data: { status: "paired" } });
      return { ok: true, paired: true, optedIn: false };
    }
    if (update.kind === "nativeReply") {
      const pref = await tx.communicationPreference.findUnique({ where: { verifiedChatId: update.chatId }, include: { user: true } });
      if (!pref || pref.verificationTransport !== "telegram" || pref.verifiedActorId !== update.actorId) throw new ApiError("This private chat is not linked to an athlete", 409);
      const prompt = await tx.coachingPrompt.findFirst({ where: { userId: pref.userId, receiptId: update.receiptId, transport: "telegram" } });
      if (!prompt) throw new ApiError("Reply to the original coaching message or open the app", 409);
      const result = await receiveCoachingReply(pref.user, { ...update, promptId: prompt.id, sessionId: prompt.sessionId, observationDate: prompt.observationDate,
        sourceRevision: prompt.sourceRevision, timezone: prompt.timezone }, now, "telegram", update.receiptId, tx);
      await tx.telegramCoachingUpdate.update({ where: { id }, data: { status: "drafted" } });
      return result;
    }
    const prompt = await tx.coachingPrompt.findFirst({ where: { tokenHash: hashToken(update.token), transport: "telegram" }, include: { user: true } });
    if (!prompt) throw new ApiError("Reply token invalid or already used", 409);
    const result = await receiveCoachingReply(prompt.user, { ...update, promptId: prompt.id, timezone: prompt.timezone }, now, "telegram", undefined, tx);
    await tx.telegramCoachingUpdate.update({ where: { id }, data: { status: "drafted" } });
    return result;
  }, { isolationLevel: "Serializable", timeout: 15000 }); } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2034") {
      // A concurrent identical delivery may have committed while this snapshot
      // lost serialization. Acknowledge only proven terminal processing; an
      // absent/in-flight claim still propagates for Telegram's safe retry.
      const completed = await prisma.telegramCoachingUpdate.findUnique({ where: { id: String(update.updateId) } });
      if (completed && completed.status !== "processing") return { ok: true, duplicate: true };
    }
    throw e;
  }
}
export async function disconnectCoaching(actor: CoachingActor) {
  return prisma.$transaction(async tx => {
    await tx.communicationPreference.updateMany({ where: { userId: actor.id }, data: {
      paused: true, dailyPlan: false, sessionFeedback: false, missingData: false,
      verifiedChatId: null, verifiedActorId: null, verifiedEmail: null, verifiedAt: null, verificationTransport: null,
      challengeHash: null, challengeExpiresAt: null, consentVersion: null, consentAt: null,
    } });
    await tx.coachingPrompt.updateMany({ where: { userId: actor.id, replyStatus: { in: ["none", "pending"] } }, data: {
      status: "cancelled", replyStatus: "revoked", tokenHash: null, tokenExpiresAt: null, candidate: null, error: "Athlete disconnected coaching communication.",
    } });
    await tx.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: "communication.disconnected", after: JSON.stringify({ allPurposes: false, outstandingChallengesAndReplies: "revoked" }) } });
    return { ok: true, disconnected: true };
  }, { isolationLevel: "Serializable" });
}


export async function reconcileCoachingAttempts(now = new Date(), db: Pick<typeof prisma, "coachingPrompt"> = prisma) {
  return db.coachingPrompt.updateMany({ where: { status: "pending", lastAttemptAt: { lt: new Date(now.getTime() - 20 * 60_000) } },
    data: { status: "unknown", error: "Interrupted attempt; acceptance is unknown. Do not automatically resend.", tokenHash: null, tokenExpiresAt: null, nextAttemptAt: null } });
}
export async function finalizeTelegramAttempt(id: string, userId: string, result: Awaited<ReturnType<typeof sendTelegramCoaching>>) {
  return prisma.$transaction(async tx => {
    const prompt = await tx.coachingPrompt.findFirst({ where: { id, userId } });
    if (!prompt) throw new ApiError("Delivery record unavailable; do not resend", 409);
    const data = { ...result, nextAttemptAt: result.status === "failed" && prompt.attempts < 3 ? new Date(Date.now() + 60_000 * 2 ** (prompt.attempts - 1)) : null,
      ...(result.status !== "sent" ? { tokenHash: null, tokenExpiresAt: null } : {}) };
    const updated = await tx.coachingPrompt.updateMany({ where: { id, userId, status: "pending" }, data });
    if (!updated.count) {
      // A disconnect while HTTP was in flight cannot unsend an accepted message.
      // Preserve revocation and prevent use of its reply token while recording
      // the late provider outcome honestly.
      await tx.coachingPrompt.updateMany({ where: { id, userId, status: { in: ["cancelled", "unknown"] } }, data: {
        receiptId: result.receiptId, error: result.status === "sent" ? "Provider accepted while cancellation/reconciliation was in progress. Reply access remains revoked; reading is unknown." : result.error,
        tokenHash: null, tokenExpiresAt: null, nextAttemptAt: null,
      } });
    }
    await tx.auditLog.create({ data: { actorId: userId, subjectId: userId, action: "communication.telegram-outcome", entityId: id,
      after: JSON.stringify({ providerStatus: result.status, receiptId: result.receiptId, claimFinalized: Boolean(updated.count), read: false }) } });
    return tx.coachingPrompt.findUniqueOrThrow({ where: { id } });
  }, { isolationLevel: "Serializable" });
}
