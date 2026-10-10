import { prisma } from "./db";
import { localDate, addDaysKey } from "./dates";
import { effectivePrescription } from "./effective-prescription";
import { telegramPlan, gmailPlanHtml, calendarDescription, stepEndpointLabel, type PlanFormatSession } from "./plan-formats";
import { renderDayPng, type GraphicStep } from "./workout-graphic";

function appBase() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit";
  const url = new URL(configured);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid app URL");
  return url.origin;
}
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Each delivery resolves the same current athlete-scoped object as the screen
// and FIT. A future or unsafe session cannot fall back to the original plan.
export async function trainingReminder(user: { id: string; name: string; timezone: string; language?: string; profile?: any }, key: string) {
  const sessions = await prisma.workout.findMany({
    where: { userId: user.id, planned: true, completed: false,
      date: { gte: localDate(key, user.timezone), lt: localDate(addDaysKey(key, 1), user.timezone) } },
    orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
  });
  const resolved = await Promise.all(sessions.map(async w => {
    if (w.feedbackStatus === "skipped") return null;
    try { return await effectivePrescription(user.id, w.id); }
    catch { return null; } // malformed/unresolvable data never becomes exercise
  }));
  const fmt: PlanFormatSession[] = [];
  const details: string[] = [];
  const base = appBase();
  for (const item of resolved) {
    if (!item || item.canonical.verdict !== "ready") continue;
    const { canonical: c, workout: w, prescription: p } = item;
    const fuel = item.nutrition?.fuel ?? null;
    const post = item.nutrition?.post ?? null;
    // Formats expose summarized amounts/cautions only, never saved GI history
    // or free-text measurement context. No supplement recommendation is added.
    const s: PlanFormatSession = { id: c.id, revision: c.revision, verdict: c.verdict,
      title: c.title, sport: c.sport, durationMin: c.durationMin, intensity: p.intensity,
      startTime: w.startTime, appUrl: `${base}/daily?sessionId=${encodeURIComponent(c.id)}`,
      steps: c.steps.map(st => ({ name: st.name, seconds: st.seconds, reps: st.reps,
        endpoint: st.endpoint, targetLabel: st.target.label, zone: st.zone, phase: st.phase, note: st.note })),
      fuel, post, environment: c.environment, language: user.language };
    fmt.push(s);
    details.push([`${c.title} · revision ${c.revision.slice(0, 12)}`,
      ...(s.steps || []).map(st => `${st.phase}: ${st.name} · ${stepEndpointLabel(st)} · ${st.targetLabel}${st.note ? `\n${st.note}` : ""}`),
      "Fuel/fluid guidance is a starting reference; do not drink beyond need. Review full before/during/after guidance in the app.",
      s.appUrl || ""].join("\n"));
  }
  const pending = sessions.length - fmt.length;
  // No symptoms, restrictions or medical reasons leave the app in a reminder.
  const why = pending ? "Some sessions need a current check-in or plan review in the app. No workout is cleared by this reminder." : null;
  const text = telegramPlan(user.name, key, fmt, why) + `\n\n${base}/daily\nManage or pause reminders: ${base}/reminders`;
  const gmail = gmailPlanHtml(user.name, key, fmt);
  // Exact timed steps only: estimates for distance/reps/lap are not a time chart.
  const rows: GraphicStep[][] = fmt.filter(s => s.steps?.every(st => st.endpoint?.type === "time"))
    .map(s => (s.steps || []).map(st => ({ name: st.name, seconds: st.seconds, zone: st.zone, phase: st.phase })));
  const png = rows.length ? renderDayPng(rows) : null;
  const html = `${gmail.html}<p>${escapeHtml(why || "Review the current plan before training.")}</p><pre style="white-space:pre-wrap">${escapeHtml(details.join("\n\n"))}</pre><p>Manage or pause reminders: ${base}/reminders</p>`;
  return { text, subject: `Jasmethod — ${key}`, html, calendarDescriptions: fmt.map(calendarDescription),
    png, pngCid: "workout-shape", sessions: fmt };
}
