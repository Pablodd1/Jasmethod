import { dateKey, localDate } from "./dates";
import { sessionFitEntries } from "./fit-export";
import { fitFilename, type CanonicalSession } from "./canonical-session";
import { buildZip, type ZipEntry } from "./zip";
import { manualWorkoutCalendarDescription } from "./manual-workout-email-content";
import { manualWorkoutCalendarPlaceholder } from "./manual-workout-calendar";
import { manualEmailLanguage } from "./manual-workout-email-locale";
import type { SessionNutrition } from "./session-nutrition";

type Row = Record<string, unknown>;

export interface TrainingExportData {
  resolvedNutrition?: Record<string, SessionNutrition>;
  resolvedSessions?: Record<string, CanonicalSession>;
  resolutionErrors?: Record<string, string>;
  athlete: { name: string; email: string; timezone: string; language?: string };
  workouts: Array<
    Row & {
      date: Date;
      completed: boolean;
      durationMin: number;
      actualDurationMin?: number | null;
    }
  >;
  metrics: Row[];
  sleep: Row[];
  checkins: Row[];
  plan: null | {
    name: string;
    days: Array<
      Row & {
        date: Date;
        week: number;
        dayOff: boolean;
        sessions: Array<Row & { id: string; date: Date; title: string; sport: string; durationMin: number }>;
      }
    >;
  };
  profile?: {
    lthr?: number | null;
    ftp?: number | null;
    weightKg?: number | null;
    sweatRateMlH?: number | null;
    sodiumMgPerL?: number | null;
    gutTrained?: boolean | null;
  } | null;
}

const csvCell = (value: unknown) => {
  if (value == null) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Untrusted notes/provider titles must not execute spreadsheet formulas.
  if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = "\'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows: Row[], columns: string[]): string {
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n") + "\r\n";
}

const icsText = (value: unknown) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const utcStamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function buildTrainingCalendar(data: TrainingExportData): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JasMiamiMethod//Training Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(data.plan?.name || "JasMiamiMethod Training")}`,
  ];
  for (const day of data.plan?.days || []) {
    if (day.dayOff) continue;
    for (const session of day.sessions) {
      if (session.durationMin <= 0) continue;
      const resolved = data.resolvedSessions?.[session.id];
      if (resolved && resolved.verdict === "rest") continue;
      const key = dateKey(session.date, data.athlete.timezone);
      const start = localDate(
        key,
        data.athlete.timezone,
        typeof session.startTime === "string" && /^\d{2}:\d{2}$/.test(session.startTime)
          ? session.startTime
          : "06:00",
      );
      const savedLanguage = data.athlete.language ?? "en";
      const language = manualEmailLanguage(savedLanguage);
      const appUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit").replace(/\/$/, "")}/daily?sessionId=${encodeURIComponent(String(session.id))}`;
      const placeholder = manualWorkoutCalendarPlaceholder(savedLanguage, resolved?.verdict === "ready", appUrl);
      const snapshotNotice: Record<string, string> = {
        en: "Downloaded calendar snapshot: later changes require a fresh export; this file does not auto-sync.",
        es: "Copia del calendario descargada: los cambios posteriores requieren una nueva exportación; este archivo no se sincroniza automáticamente.",
        fr: "Copie du calendrier téléchargée : les modifications nécessitent un nouvel export ; ce fichier ne se synchronise pas automatiquement.",
        ht: "Kopi kalandriye telechaje: chanjman yo mande yon nouvo ekspòtasyon; fichye sa a pa senkronize otomatikman.",
        ru: "Скачанная копия календаря: для последующих изменений нужен новый экспорт; файл не синхронизируется автоматически.",
      };
      const description = resolved?.verdict === "ready" && language
        ? manualWorkoutCalendarDescription(resolved, data.resolvedNutrition?.[session.id] ?? null, typeof session.startTime === "string" ? session.startTime : null, language) + `\n${language === "es" ? "Plan actual y gráfico (requiere iniciar sesión)" : "Current plan and workout graphic (sign-in required)"}: ${appUrl}`
        : placeholder.description;
      const durationMin = resolved?.verdict === "ready" ? resolved.durationMin : session.durationMin;
      const end = new Date(start.getTime() + durationMin * 60000);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${icsText(session.id)}@jasmiamimethod`,
        `DTSTAMP:${utcStamp(new Date())}`,
        `DTSTART:${utcStamp(start)}`,
        `DTEND:${utcStamp(end)}`,
        `SUMMARY:${icsText(resolved?.verdict === "ready" && language ? resolved.title : placeholder.summary)}`,
        `DESCRIPTION:${icsText(`${description}\n${snapshotNotice[savedLanguage] || snapshotNotice.en}`)}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function buildTrainingBundle(data: TrainingExportData, created = new Date()) {
  const planned = (data.plan?.days || []).flatMap((day) =>
    day.sessions.map((session) => ({
      ...session,
      date: dateKey(session.date, data.athlete.timezone),
      week: day.week,
      dayOff: day.dayOff,
    })),
  );
  const history = data.workouts.map((workout) => ({
    ...workout,
    date:
      workout.date instanceof Date
        ? dateKey(workout.date, data.athlete.timezone)
        : workout.date,
  }));
  const completed = history.filter((w) => w.completed === true);
  const entries: ZipEntry[] = [
    {
      name: "README.txt",
      data: [
        "JasMiamiMethod complete training export",
        `Athlete: ${data.athlete.name} <${data.athlete.email}>`,
        `Generated: ${created.toISOString()}`,
        "",
        "training-plan.csv: every session in the active plan.",
        "training-history.csv: all planned, manual, and imported training records.",
        "daily-metrics.csv, sleep.csv, checkins.csv: source data used by analytics.",
        "training-calendar.ics: import the active plan into Google Calendar, Apple Calendar, or Outlook.",
        "fit/: only current, safety-resolved, supported workout files. fit-export-status.csv explains every export or omission.",
        "Future, held, malformed, rest and unsupported workouts have no FIT. Reassess on the session day.",
        "",
        "FIT encoding does not prove device receipt or hardware compatibility. For a supported Garmin device, use a data-capable USB cable and Garmin/NewFiles; verify every step before training. Garmin Connect activity upload is not a workout import route. Mac MTP limitations may require Windows.",
      ].join("\r\n"),
    },
    {
      name: "analytics-summary.csv",
      data: toCsv(
        [
          { metric: "training_records", value: history.length },
          { metric: "completed_sessions", value: completed.length },
          {
            metric: "completed_minutes",
            value: completed.reduce(
              (sum, w) => sum + Number(w.actualDurationMin || w.durationMin || 0),
              0,
            ),
          },
          { metric: "active_plan_sessions", value: planned.length },
          { metric: "daily_metric_records", value: data.metrics.length },
          { metric: "sleep_records", value: data.sleep.length },
          { metric: "checkins", value: data.checkins.length },
        ],
        ["metric", "value"],
      ),
    },
    {
      name: "training-plan.csv",
      data: toCsv(planned, [
        "date",
        "week",
        "startTime",
        "sport",
        "title",
        "type",
        "durationMin",
        "distanceKm",
        "intensity",
        "tss",
        "completed",
        "dayOff",
        "notes",
      ]),
    },
    {
      name: "training-history.csv",
      data: toCsv(history, [
        "date",
        "startTime",
        "sport",
        "title",
        "type",
        "durationMin",
        "actualDurationMin",
        "distanceKm",
        "intensity",
        "rpe",
        "tss",
        "completed",
        "feedbackStatus",
        "avgHr",
        "maxHr",
        "avgPower",
        "np",
        "calories",
        "source",
        "notes",
      ]),
    },
    {
      name: "daily-metrics.csv",
      data: toCsv(data.metrics, [
        "date",
        "hrv",
        "hrvType",
        "restingHr",
        "sleepScore",
        "recoveryScore",
        "stressScore",
        "energy",
        "weightKg",
        "bodyFat",
        "sleepHours",
        "source",
      ]),
    },
    {
      name: "sleep.csv",
      data: toCsv(data.sleep, [
        "date",
        "bedTime",
        "wakeTime",
        "hours",
        "deepHours",
        "remHours",
        "lightHours",
        "awakenings",
        "efficiency",
        "quality",
        "source",
      ]),
    },
    {
      name: "checkins.csv",
      data: toCsv(data.checkins, ["date", "answers", "adaptation", "fuel", "ergos"]),
    },
    { name: "training-calendar.ics", data: buildTrainingCalendar(data) },
  ];

  const statuses: Row[] = [];
  for (const day of data.plan?.days || []) {
    for (const session of day.sessions) {
      // Only the authenticated service may supply effective sessions. Missing
      // resolution is held, never rebuilt from a raw original plan or protocol.
      const resolved = data.resolvedSessions?.[session.id];
      if (!resolved) {
        statuses.push({ sessionId: session.id, date: dateKey(session.date, data.athlete.timezone), title: session.title, verdict: "blocked", mode: "unavailable", status: "omitted", reason: data.resolutionErrors?.[session.id] || "No authenticated current safety resolution was supplied." });
        continue;
      }
      const row = { sessionId: session.id, date: resolved.dateLocal, title: resolved.title, revision: resolved.revision, verdict: resolved.verdict, mode: resolved.capability.mode, status: "omitted", reason: resolved.verdict === "ready" ? resolved.capability.reason : resolved.reason };
      if (resolved.verdict === "ready" && resolved.capability.available) {
        const folder = resolved.capability.mode === "split" ? `${fitFilename(resolved).replace(/\.fit$/, "-components")}/` : "";
        entries.push(...sessionFitEntries(resolved, created).map(entry => ({ ...entry, name: `fit/${folder}${entry.name}` })));
        row.status = "encoded-device-unverified";
      }
      statuses.push(row);
    }
  }
  entries.push({ name: "fit-export-status.csv", data: toCsv(statuses, ["sessionId", "date", "title", "revision", "verdict", "mode", "status", "reason"]) });
  return buildZip(entries, created);
}
