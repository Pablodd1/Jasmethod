import { dailyEnvironmentSummary, type DailyEnvironmentAssessment } from "./daily-environment";
import { trustedCycleMovementGuidance } from "./cycle-movement-guidance";
// JasMiamiMethod — Creative plan formats
//
// One training plan, three skins: Telegram text (emoji-dense, scannable in a
// chat bubble), Gmail HTML (styled cards, inline CSS), and calendar event
// descriptions (plain-text with icons, safe for ICS/Google). All derive from
// the same session shape — no surface drifts from the source of truth.

import { createHmac } from "crypto";
import { graphicSigningSecret } from "./workout-graphic";

export interface PlanFormatSession {
  title: string;
  sport: string;
  type?: string;
  durationMin: number;
  intensity?: string | null;
  startTime?: string | null;
  id?: string;
  revision?: string;
  verdict?: string;
  appUrl?: string;
  environment?: DailyEnvironmentAssessment;
  language?: string;
  steps?: {
    name: string;
    seconds: number;
    reps?: number;
    endpoint?: { type: "time"; seconds: number } | { type: "distance"; meters: number } | { type: "reps"; reps: number } | { type: "lap" };
    targetLabel?: string;
    zone: string;
    note?: string;
    phase?: "warmup" | "active" | "recovery" | "cooldown";
  }[];
  fuel?: {
    preSession?: { carbsG: number | null; timingLabel: string };
    fluidSource?: string;
    sodiumSource?: string;
    carbsPerHourG: number;
    fluidMlPerHour: number;
    sodiumMgPerHour: number;
    segments?: { atMin: number; label: string }[];
  } | null;
  post?: { carbsG: number | null; proteinG: number | null; note?: string } | null;
}

// A repetition/distance/open endpoint must never be turned into a timed block.
export function stepEndpointLabel(step: NonNullable<PlanFormatSession["steps"]>[number]): string {
  const end = step.endpoint;
  if (end?.type === "distance") return `${end.meters} m`;
  if (end?.type === "lap") return "Lap/manual end";
  if (end?.type === "reps") return `${end.reps} reps`;
  if (step.reps) return `${step.reps} reps`;
  const seconds = end?.type === "time" ? end.seconds : step.seconds;
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function postFuelLabel(post: NonNullable<PlanFormatSession["post"]>): string {
  if (post.note) return post.note;
  return post.carbsG != null && post.proteinG != null
    ? `${post.carbsG}g carbs + ${post.proteinG}g protein`
    : post.note || "Body mass is unknown. Have a familiar mixed meal; gram targets are unavailable.";
}

function sessionTimeLabel(session: PlanFormatSession): string {
  const estimated = session.steps?.some(step => Boolean(step.reps) || (step.endpoint && step.endpoint.type !== "time"));
  return `${session.durationMin} min${estimated ? " estimated" : ""}`;
}

// ---- Iconography ----

const SPORT_ICON: Record<string, string> = {
  swim: "🏊", bike: "🚴", run: "🏃", strength: "🏋️", mobility: "🧘",
  recovery: "☁️", brick: "🔀", boxing: "🥊", hyrox: "🔥",
  "track-sprint": "⚡", lifting: "🏋️", plyo: "🤸", test: "⏱️", race: "🏁",
};

export function sportIcon(sport: string): string {
  return SPORT_ICON[sport] || "🏃";
}

// Zone → traffic-dot: effort readable at a glance in any chat client.
export function zoneDot(zone?: string | null): string {
  const z = Number((zone || "z2").slice(1));
  if (z <= 2) return "🟢";
  if (z === 3) return "🟡";
  if (z === 4) return "🟠";
  return "🔴";
}

// ---- Telegram (compact chat plan) ----

export function telegramPlan(
  athleteName: string,
  dateLabel: string,
  sessions: PlanFormatSession[],
  whyLine?: string | null,
): string {
  const lines: string[] = [`⚡️ ${athleteName} — ${dateLabel}`];
  // THE WHY, first — one plain sentence for why today looks the way it does
  // (the retention feature: the athlete never wonders what the plan is doing).
  if (whyLine) lines.push(`💡 ${whyLine}`);
  if (!sessions.length) {
    lines.push("", "☁️ No exercise is cleared in this reminder. Rest stays rest; review your plan and current check-in in the app.");
  }
  for (const s of sessions) {
    const icon = sportIcon(s.sport);
    const time = s.startTime ? `${s.startTime} · ` : "";
    const zone = s.intensity ? `${s.intensity.toUpperCase()}` : "";
    lines.push(
      "",
      `${icon} ${time}${s.title} — ${sessionTimeLabel(s)} ${zoneDot(s.intensity)}${zone}`,
    );
    // First two key steps only — the chat stays a plan, not a novel.
    const key = (s.steps || []).filter((x) => x.phase === "active").slice(0, 2);
    for (const st of key)
      lines.push(
        `   • ${stepEndpointLabel(st)} ${st.name}${st.targetLabel ? ` · ${st.targetLabel}` : ""}${trustedCycleMovementGuidance(st) ? ` · ${trustedCycleMovementGuidance(st)}` : ""}`,
      );
    if (s.fuel?.carbsPerHourG || s.fuel?.fluidMlPerHour)
      lines.push(
        `   ⛽ ${s.fuel.carbsPerHourG}g/h + up to ${s.fuel.fluidMlPerHour}ml/h as general examples. Drink to need; never force fluids or overdrink.`,
      );
    if (s.post) lines.push(`   🍚 post: ${postFuelLabel(s.post)}`);
    if (s.environment) lines.push(`   ${dailyEnvironmentSummary(s.environment, s.language)}`);
    if (s.appUrl) lines.push(`   Full instructions and feedback: ${s.appUrl}`);
    if (s.revision) lines.push(`   Plan revision: ${s.revision.slice(0, 12)}`);
  }
  lines.push("", "👉 Check in before training — the plan adapts to your day.");
  return lines.join("\n");
}

// ---- Gmail (styled HTML email) ----

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function gmailPlanHtml(
  athleteName: string,
  dateLabel: string,
  sessions: PlanFormatSession[],
): { subject: string; html: string } {
  const subject = `📋 ${athleteName} — ${dateLabel}'s plan`;
  const body = sessions.length
    ? sessions
        .map((s) => {
          const zone = s.intensity ? `${s.intensity.toUpperCase()}` : "";
          const steps = (s.steps || [])
            .filter((x) => x.phase === "active" || x.phase === "recovery")
            .slice(0, 6)
            .map(
              (st) =>
                `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px dashed #e2e8f0;font-size:13px;color:#334155">
                   <span>${esc(st.name)}${st.note ? ` <span style="color:#94a3b8">— ${esc(st.note)}</span>` : ""}</span>
                   <strong style="white-space:nowrap">${esc(stepEndpointLabel(st))}</strong>
                 </div>`,
            )
            .join("");
          const fuelLine =
            s.fuel && (s.fuel.carbsPerHourG || s.fuel.fluidMlPerHour)
              ? `<div style="background:#fff7ed;border-radius:8px;padding:6px 10px;margin-top:8px;font-size:12px;color:#9a3412">⛽ ${s.fuel.carbsPerHourG}g carbs/h · ${s.fuel.fluidMlPerHour}ml/h${s.fuel.sodiumMgPerHour ? ` · ${s.fuel.sodiumMgPerHour}mg sodium/h` : ""}. General examples, not measured current needs. Never force fluids or overdrink.</div>`
              : "";
          const postLine = s.post
            ? `<div style="font-size:12px;color:#475569;margin-top:6px">🍚 Post: ${esc(postFuelLabel(s.post))}</div>`
            : "";
          return `
  <div style="border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:12px;padding:14px 16px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <strong style="font-size:15px;color:#0f172a">${sportIcon(s.sport)} ${esc(s.title)}</strong>
      <span style="font-size:13px;color:#475569">${zone} · ${sessionTimeLabel(s)}</span>
    </div>
    ${steps ? `<div style="margin-top:8px">${steps}</div>` : ""}
    ${fuelLine}${postLine}
    ${s.environment ? `<p>${esc(dailyEnvironmentSummary(s.environment, s.language))}</p>` : ""}
    ${s.appUrl ? `<p><a href="${esc(s.appUrl)}">Full instructions and feedback</a></p>` : ""}
    ${s.revision ? `<small>Plan revision: ${esc(s.revision.slice(0, 12))}</small>` : ""}
  </div>`;
        })
        .join("")
    : `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;font-size:14px;color:#334155">
         ☁️ No exercise is cleared in this reminder. Rest stays rest; review your plan and current check-in in the app.
       </div>`;

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:auto;background:#f8fafc;border-radius:16px;padding:24px;border:1px solid #e2e8f0">
  <div style="margin-bottom:14px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">JasMiamiMethod</div>
    <h1 style="margin:4px 0 0;font-size:20px;color:#0f172a">⚡️ ${esc(athleteName)} — ${esc(dateLabel)}</h1>
  </div>
  ${body}
  <div style="font-size:12px;color:#64748b;margin-top:8px">Check in before training — the plan adapts to your day. → ${"{{APP_URL}}/today"}</div>
</div>`;
  return { subject, html };
}

// ---- Calendar event descriptions (ICS + Google) ----

export function calendarDescription(
  s: PlanFormatSession & { id?: string },
): string {
  const lines: string[] = [
    `${sportIcon(s.sport)} ${s.title} — ${sessionTimeLabel(s)} ${zoneDot(s.intensity)}${s.intensity ? s.intensity.toUpperCase() : ""}`,
  ];
  const key = (s.steps || []).filter((x) => x.phase === "active").slice(0, 4);
  for (const st of key)
    lines.push(
      `• ${stepEndpointLabel(st)} ${st.name}${st.targetLabel ? ` · ${st.targetLabel}` : ""}${trustedCycleMovementGuidance(st) ? ` · ${trustedCycleMovementGuidance(st)}` : ""}`,
    );
  if (s.fuel?.preSession?.carbsG)
    lines.push(`⛽ Pre: ${s.fuel.preSession.carbsG}g ${s.fuel.preSession.timingLabel}`);
  if (s.fuel?.carbsPerHourG || s.fuel?.fluidMlPerHour)
    lines.push(
      `⛽ During: ${s.fuel.carbsPerHourG}g/h + up to ${s.fuel.fluidMlPerHour}ml/h as general examples. Drink to need; never force fluids or overdrink.`,
    );
  if (s.post) lines.push(`🍚 Post: ${postFuelLabel(s.post)}`);
  if (s.environment) lines.push(dailyEnvironmentSummary(s.environment, s.language));
  lines.push(s.environment ? (s.language === "es" ? "Preparación: revisa el material y las condiciones locales actuales. El pronóstico no es una medición ni autorización para entrenar." : "Preparation: check equipment and current local conditions. A forecast is not a measurement or clearance to train.") : "Preparation: check equipment, route and current local conditions. Weather is not verified here. In heat, plan cooling and water access. Optional: a comfortable breathing pause to focus.");
  lines.push("— JasMiamiMethod · check in before training");
  return lines.join("\n");
}

// Calendar-safe shape link (Google Calendar keeps plain URLs clickable).
export function shapeLink(sessionId: string): string {
  const exp = Date.now() + 30 * 86400000;
  const sig = createHmac("sha256", graphicSigningSecret())
    .update(`${sessionId}.${exp}`)
    .digest("hex")
    .slice(0, 32);
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit";
  return `${base}/api/workout/graphic?sessionId=${sessionId}&token=${exp}.${sig}&format=png`;
}
