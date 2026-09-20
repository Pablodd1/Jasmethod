import { dateKey, localDate } from "./dates";
import { buildFitWorkout, workoutToFitSpec } from "./fit-export";
import { buildZip, type ZipEntry } from "./zip";
import { calendarDescription, type PlanFormatSession } from "./plan-formats";
import { buildFuelingPlan } from "./fueling";

type Row = Record<string, unknown>;

// Prescription JSON → exportable steps (defensive against old/odd data).
function safeSteps(prescription: unknown): PlanFormatSession["steps"] {
  if (typeof prescription !== "string") return [];
  try {
    const p = JSON.parse(prescription);
    return Array.isArray(p.steps)
      ? p.steps.map((s: any) => ({
          name: String(s.name || "Step"),
          seconds: Number(s.seconds) || 0,
          reps: s.reps,
          zone: String(s.zone || "z2"),
          note: s.note,
        }))
      : [];
  } catch {
    return [];
  }
}

export interface TrainingExportData {
  athlete: { name: string; email: string; timezone: string };
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
  const text = value instanceof Date ? value.toISOString() : String(value);
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
      const key = dateKey(session.date, data.athlete.timezone);
      const start = localDate(
        key,
        data.athlete.timezone,
        typeof session.startTime === "string" && /^\d{2}:\d{2}$/.test(session.startTime)
          ? session.startTime
          : "06:00",
      );
      const end = new Date(start.getTime() + session.durationMin * 60000);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${icsText(session.id)}@jasmiamimethod`,
        `DTSTAMP:${utcStamp(new Date())}`,
        `DTSTART:${utcStamp(start)}`,
        `DTEND:${utcStamp(end)}`,
        `SUMMARY:${icsText(session.title)}`,
        `DESCRIPTION:${icsText(
          calendarDescription({
            title: String(session.title),
            sport: String(session.sport),
            durationMin: Number(session.durationMin),
            intensity: (session.intensity as string) ?? null,
            steps: safeSteps(session.prescription),
            fuel: buildFuelingPlan({
              durationMin: Number(session.durationMin),
              intensity: String(session.intensity || "z2"),
              weightKg: data.profile?.weightKg,
              sweatRateMlH: data.profile?.sweatRateMlH,
              sodiumMgPerL: data.profile?.sodiumMgPerL,
              gutTrained: !!data.profile?.gutTrained,
            }),
          }),
        )}`,
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

const safePart = (value: unknown) =>
  String(value || "workout")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 45)
    .toLowerCase() || "workout";

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
        "fit/: one structured workout per active-plan session for compatible Garmin/COROS workflows.",
        "",
        "FIT import support varies by platform and device. WHOOP and Strava supply recorded data to JasMiamiMethod; they do not accept this training-plan bundle from the app.",
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

  for (const day of data.plan?.days || []) {
    if (day.dayOff) continue;
    for (const session of day.sessions) {
      if (session.durationMin <= 0) continue;
      const fit = buildFitWorkout(
        workoutToFitSpec(
          {
            title: session.title,
            sport: session.sport,
            durationMin: session.durationMin,
            type: String(session.type || "endurance"),
            prescription:
              typeof session.prescription === "string" ? session.prescription : null,
            originalPlan: typeof session.originalPlan === "string" ? session.originalPlan : null,
            lthr: data.profile?.lthr,
            ftp: data.profile?.ftp,
          },
          { zone: typeof session.intensity === "string" ? session.intensity : "z2" },
        ),
        created,
      );
      entries.push({
        name: `fit/${dateKey(session.date, data.athlete.timezone)}-${safePart(session.sport)}-${safePart(session.title)}-${safePart(session.id).slice(0, 8)}.fit`,
        data: fit,
      });
    }
  }
  return buildZip(entries, created);
}
