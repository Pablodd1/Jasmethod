import Link from "next/link";
import { readinessReasonText } from "./readiness-copy";

type NextWorkout = {
  id: string;
  title: string;
  date: string;
  plannedMinutes: number | null;
  effectiveMinutes: number | null;
  status: "ready" | "rest" | "blocked" | "pending";
  reason: string | null;
  checkinNote?: string | null;
};

export function isNextTrainingReview(value: unknown): value is NextWorkout {
  if (!value || typeof value !== "object") return false;
  const row = value as NextWorkout;
  const minutes = (n: unknown) => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0);
  return typeof row.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(row.id) &&
    typeof row.title === "string" && typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    ["ready", "rest", "blocked", "pending"].includes(row.status) &&
    minutes(row.plannedMinutes) && minutes(row.effectiveMinutes) && (row.reason === null || typeof row.reason === "string") &&
    (row.checkinNote == null || typeof row.checkinNote === "string");
}

export function NextTrainingReview({ review, es }: { review: unknown; es: boolean }) {
  if (!isNextTrainingReview(review)) return null;
  const status = review.status === "ready" ? (es ? "Revisada para hoy" : "Reviewed for today")
    : review.status === "rest" ? (es ? "Recuperación indicada" : "Recovery indicated")
    : review.status === "blocked" ? (es ? "Requiere revisión" : "Needs review")
    : (es ? "Pendiente del check-in del día" : "Session-day check-in pending");
  const change = review.plannedMinutes != null && review.effectiveMinutes != null ? review.effectiveMinutes - review.plannedMinutes : null;
  return <section className="rounded-lg border p-3 text-sm space-y-1" aria-label={es ? "Próxima sesión" : "Next session"}>
    <h3 className="font-semibold">{es ? "Próxima sesión" : "Next session"}</h3>
    <p>{review.date} · {review.title}</p>
    <p>{status} · {es ? "Previsto" : "Planned"} {review.plannedMinutes ?? "—"} min
      {review.effectiveMinutes !== null && <> · {es ? "Revisado" : "Reviewed"} {review.effectiveMinutes} min</>}
    </p>
    {change != null && change !== 0 && <p>{es ? "Cambio de duración para hoy" : "Today’s duration change"}: {change > 0 ? "+" : ""}{change} min. {es ? "El ciclo guardado sigue visible." : "The saved cycle remains visible."}</p>}
    {review.checkinNote && change != null && change !== 0 && <p><strong>{es ? "Nota del check-in:" : "Check-in note:"}</strong> {readinessReasonText(review.checkinNote, es)}</p>}
    {review.reason && review.status !== "ready" && <p>{readinessReasonText(review.reason, es)}</p>}
    <Link className="underline min-h-11 inline-flex items-center" href={`/daily?sessionId=${encodeURIComponent(review.id)}`}>
      {es ? "Abrir sesión" : "Open session"}
    </Link>
  </section>;
}
