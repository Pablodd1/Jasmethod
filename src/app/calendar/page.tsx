"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Dumbbell,
  Flag,
  X,
  Clock,
  Thermometer,
  MapPin,
  CheckCircle2,
  CloudSun,
} from "lucide-react";
import { workoutDetail } from "@/lib/workout-view";
import { dateKey } from "@/lib/dates";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  addDays,
} from "date-fns";
import { buildSessionDetail } from "@/lib/science";
import { dayOffProtocol, temperatureAdjustment } from "@/lib/adaptive";
import { WeekStrip } from "@/components/week-strip";

const SPORT_COLOR: Record<string, string> = {
  swim: "bg-sky-100 text-sky-700",
  bike: "bg-emerald-100 text-emerald-700",
  run: "bg-orange-100 text-orange-700",
  strength: "bg-purple-100 text-purple-700",
  brick: "bg-red-100 text-red-700",
  hyrox: "bg-amber-100 text-amber-700",
  boxing: "bg-rose-100 text-rose-700",
  recovery: "bg-slate-100 text-slate-600",
};

function fmtMin(min: number) {
  if (min >= 60)
    return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`;
  return `${min}m`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  const [view, setView] = useState<"days" | "month">("days"); // 3-day default
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const [resultFor, setResultFor] = useState<any>(null);
  const [resultBusy, setResultBusy] = useState(false);
  const [resultError, setResultError] = useState("");
  const [evForm, setEvForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    type: "note",
    notes: "",
  });
  const [selected, setSelected] = useState<string | null>(null); // yyyy-MM-dd
  const [stripWorkouts, setStripWorkouts] = useState<any[]>([]); // prev month → next month for the week strip
  const [mutationError, setMutationError] = useState("");
  const [moveFor, setMoveFor] = useState<any>(null); // session being moved
  const [moveForm, setMoveForm] = useState({
    date: "",
    time: "",
    indoor: false,
    temp: "",
  });

  async function load(m: Date) {
    const key = format(m, "yyyy-MM");
    const res = await fetch(`/api/calendar?month=${key}`);
    const d = await res.json();
    setEvents(d.events || []);
    setWorkouts(d.workouts || []);
    setRaces(d.races || []);
    setPlan(d.plan);
    // Week strip spans prev/next month — one extra request, cached server-side.
    const sres = await fetch("/api/calendar?month=auto");
    if (sres.ok) {
      const sd = await sres.json();
      setStripWorkouts(sd.workouts || []);
    }
  }

  useEffect(() => {
    if (user) load(month);
  }, [user, month]);

  async function addUnplannedActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setActivityBusy(true); setMutationError(""); setActivityMessage("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch("/api/workouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save activity");
      setShowActivityForm(false);
      setActivityMessage(es ? "Actividad registrada con tus datos reales. Las sesiones planificadas no se modificaron." : "Activity saved with your reported actuals. Planned sessions were retained.");
      const observed = new Date(`${String(fields.date)}T12:00:00`);
      setMonth(observed); await load(observed);
    } catch (error) { setMutationError((error as Error).message); } finally { setActivityBusy(false); }
  }

  useEffect(() => {
    if (resultFor) document.getElementById("session-result-outcome")?.focus();
  }, [resultFor]);

  function openResult(session: any) {
    setResultError(""); setActivityMessage(""); setMutationError("");
    if (session.matchedPlanId) {
      const actual = [...workouts, ...stripWorkouts, ...allSessions].find(item => item.id === session.matchedPlanId && !item.matchedPlanId);
      if (!actual) {
        setResultFor(null);
        setMutationError(es ? "Esta sesión está vinculada a una actividad importada. Abre la fecha de esa actividad y edita su resultado; el plan no se cuenta otra vez en JStress." : "This plan is linked to an imported activity. Open that activity's date and edit its result; the plan is not counted again in JStress.");
        return;
      }
      setActivityMessage(es ? "Editando la actividad importada vinculada. El plan se conserva y no se cuenta dos veces." : "Editing the linked imported activity. Its plan is retained and is not counted twice.");
      setResultFor(actual);
      return;
    }
    setResultFor(session);
  }

  async function saveResult(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resultFor || resultBusy) return;
    setResultBusy(true); setResultError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/plan", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: resultFor.id, expectedRevision: resultFor.revision, ...fields }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.workout?.id !== resultFor.id) throw Error(result.error || "Could not verify the saved workout result.");
      setResultFor(null);
      setActivityMessage(es ? "Resultado actualizado en la sesión existente. No se creó otra actividad." : "Result updated on the existing session. No additional activity was created.");
      try { await load(month); }
      catch { setMutationError(es ? "El resultado se guardó, pero no se pudo actualizar el calendario. Recarga la página." : "The result was saved, but the calendar could not refresh. Reload the page."); }
    } catch (error) { setResultError(error instanceof Error ? error.message : "Could not save result."); }
    finally { setResultBusy(false); }
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evForm),
    });
    if (res.ok) {
      setShowForm(false);
      setEvForm({
        title: "",
        date: format(new Date(), "yyyy-MM-dd"),
        type: "note",
        notes: "",
      });
      load(month);
    }
  }

  async function api(body: any) {
    setMutationError("");
    try {
      const res = await fetch("/api/plan", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
      if(!res.ok) {const data=await res.json();throw Error(data.error||"Could not save session");}
      return true;
    } catch(error) {setMutationError((error as Error).message);return false;}
  }

  async function toggleDone(session: any) {
    await api({ sessionId: session.id, completed: !session.completed });
    load(month);
  }

  async function saveMove() {
    if (!moveFor || !moveForm.date) return;
    const ok = await api({
      sessionId: moveFor.id,
      expectedRevision: moveFor.revision,
      date: moveForm.date,
      startTime: moveForm.time || null,
      indoor: moveForm.indoor,
    });
    if (ok) {
      setMoveFor(null);
      load(month);
    }
  }

  function openMove(session: any) {
    setMoveForm({
      date: dateKey(new Date(session.date), user?.timezone),
      time: session.startTime || "",
      indoor: Boolean(session.indoor),
      temp: "",
    });
    setMoveFor(session);
  }

  const days = eachDayOfInterval({
    start: startOfMonth(month),
    end: endOfMonth(month),
  });
  const leadingBlanks = startOfMonth(month).getDay();

  // 3-day view pool: month events + the wide strip range, deduped by id.
  const allEvents = (() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const e of [...events, ...stripWorkouts, ...(races || [])]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  })();

  // Selected day: plan days (with notes + dayOff) + any standalone workouts
  const selDays = selected
    ? plan?.days?.filter(
        (d: any) => dateKey(new Date(d.date), user?.timezone) === selected,
      ) || []
    : [];
  const selDayOff = selDays.some((d: any) => d.dayOff);
  const selWorkouts = selected
    ? workouts.filter(
        (w) => dateKey(new Date(w.date), user?.timezone) === selected,
      )
    : [];
  const selSessions = selDays.flatMap((d: any) =>
    d.sessions.map((s: any) => ({
      ...s,
      notes: s.notes || d.notes,
      dayOff: d.dayOff,
    })),
  );
  const selStandalone = selWorkouts.filter(
    (w: any) => !selSessions.some((s: any) => s.id === w.id),
  );
  const allSessions = [...selSessions, ...selStandalone];
  const selEvents = selected
    ? events.filter(
        (e) => dateKey(new Date(e.date), user?.timezone) === selected,
      )
    : [];
  const tempAdvice =
    moveForm.temp && !moveForm.indoor
      ? temperatureAdjustment(parseFloat(moveForm.temp))
      : null;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        {mutationError && <p role="alert" className="text-red-700">{mutationError}</p>}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">
              Training Calendar
            </h1>
            <p className="text-slate-500 text-sm">
              Click any day to see the full workout detail, move sessions, or
              mark them done.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setMonth(addMonths(month, -1))}
              className="btn-secondary p-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="font-display font-bold text-lg text-center">
              {format(month, "MMMM yyyy")}
            </div>
            <button
              onClick={() => setMonth(addMonths(month, 1))}
              className="btn-secondary p-2"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setMonth(new Date());
                load(new Date());
              }}
              className="btn-secondary text-sm"
            >
              Today
            </button>
            <button onClick={() => setShowActivityForm(!showActivityForm)} className="btn-secondary"><Plus className="w-4 h-4" />{es ? "Registrar actividad" : "Log actual activity"}</button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" /> Event
            </button>
          </div>
        </div>

        {activityMessage && <p role="status" className="text-sm text-ocean-700">{activityMessage}</p>}
        {resultFor && <form key={resultFor.id} className="card space-y-3" onSubmit={saveResult}>
          <h2 className="font-display text-lg font-bold">{es ? "Editar resultado" : "Edit workout result"}: {resultFor.title}</h2>
          <p className="text-sm">{dateKey(new Date(resultFor.date), user?.timezone)} · {es ? "Edita esta actividad existente, incluso si llegó de un dispositivo. No añadas otra para la misma sesión." : "Update this existing activity, including a device import. Do not add another activity for the same session."}</p>
          <p className="text-xs text-slate-600">{es ? "Deja vacío lo desconocido; no uses minutos planificados como reales. JStress requiere minutos reales y tu esfuerzo percibido." : "Leave unknown values blank; do not use planned minutes as actuals. JStress needs actual minutes and your reported effort."}</p>
          <fieldset disabled={resultBusy} className="grid sm:grid-cols-3 gap-3">
            <label>{es ? "Resultado" : "Outcome"}<select id="session-result-outcome" name="feedbackStatus" required className="input" defaultValue={resultFor.feedbackStatus || ""}>
              <option value="">{es ? "Elige resultado" : "Choose outcome"}</option>
              <option value="completed">{es ? "Completado" : "Completed"}</option>
              <option value="partial">{es ? "Parcial" : "Partially completed"}</option>
              <option value="substituted">{es ? "Sustituido" : "Substituted"}</option>
              <option value="skipped">{es ? "Omitido" : "Skipped"}</option>
              <option value="unknown">{es ? "Desconocido" : "Unknown / not reported"}</option>
            </select></label>
            <label>{es ? "Minutos reales" : "Actual minutes"}<input name="actualDurationMin" className="input" type="number" min="0" max="1440" step="1" defaultValue={resultFor.actualDurationMin ?? ""} placeholder="—" /></label>
            <label>{es ? "Esfuerzo 0–10" : "Session effort 0–10"}<input name="rpe" className="input" type="number" min="0" max="10" step="1" defaultValue={resultFor.rpe ?? ""} placeholder="—" /><span className="text-xs">{es ? "0 sin esfuerzo · 10 máximo" : "0 no effort · 10 maximal"}</span></label>
            <label className="sm:col-span-3">{es ? "Notas (opcional)" : "Notes (optional)"}<textarea name="feedbackNote" className="input" maxLength={4000} defaultValue={resultFor.feedbackNote || ""} /></label>
          </fieldset>
          {resultError && <p role="alert" className="text-red-700">{resultError}</p>}
          <div className="flex gap-2"><button type="submit" disabled={resultBusy} className="btn-primary">{resultBusy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar resultado" : "Save result")}</button><button type="button" className="btn-secondary" disabled={resultBusy} onClick={() => setResultFor(null)}>{es ? "Cancelar" : "Cancel"}</button></div>
        </form>}
        {showActivityForm && (
          <form className="card space-y-3" onSubmit={addUnplannedActivity}>
            <h2 className="font-display font-bold text-lg">{es ? "Actividad realizada no planificada" : "Unplanned activity you actually did"}</h2>
            <p className="text-xs text-slate-600">{es ? "Introduce deporte, fecha local y minutos reales. Si no sabes la duración, no la sustituyas por cero o por la duración planificada; puedes registrar respuestas desconocidas en el informe de una sesión existente." : "Enter sport, local observation date and actual minutes. If duration is unknown, don't replace it with zero or planned minutes; an existing session report can retain unknown answers."}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-sm">{es ? "Deporte realizado" : "Actual sport"}<select name="sport" required defaultValue="" className="input"><option value="" disabled>{es ? "Seleccionar" : "Choose"}</option>{["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "other"].map((sport) => <option key={sport} value={sport}>{sport}</option>)}</select></label>
              <label className="text-sm">{es ? "Fecha local observada" : "Local observation date"}<input name="date" type="date" required max={dateKey(new Date(), user?.timezone)} defaultValue={selected || ""} className="input" /></label>
              <label className="text-sm">{es ? "Minutos reales" : "Actual minutes"}<input name="actualDurationMin" type="number" required min={1} max={1440} step={1} className="input" placeholder="—" /></label>
              <label className="text-sm">{es ? "Esfuerzo 0–10 (opcional)" : "Exertion 0–10 (optional)"}<input name="rpe" type="number" min={0} max={10} step={1} className="input" placeholder="—" /><span className="text-xs text-slate-500">{es ? "0 sin esfuerzo · 5 moderado · 10 máximo" : "0 no effort · 5 moderate · 10 maximal"}</span></label>
              <label className="text-sm">{es ? "Distancia (km, opcional)" : "Distance (km, optional)"}<input name="distanceKm" type="number" min={0} max={1500} step="any" className="input" placeholder="—" /></label>
              <label className="text-sm">{es ? "Repeticiones (opcional)" : "Repetitions (optional)"}<input name="reps" type="number" min={0} max={100000} step={1} className="input" placeholder="—" /></label>
              <label className="text-sm">{es ? "Carga (kg, opcional)" : "Load (kg, optional)"}<input name="loadKg" type="number" min={0} max={1500} step="any" className="input" placeholder="—" /></label>
            </div>
            <label className="block text-sm">{es ? "Título (opcional)" : "Title (optional)"}<input name="title" className="input" maxLength={200} /></label>
            <label className="block text-sm">{es ? "Notas: tolerancia, cambios, dolor y cuándo ocurrió (opcional)" : "Notes: tolerance, changes, pain and when it occurred (optional)"}<textarea name="notes" className="input" maxLength={4000} /></label>
            <button type="submit" disabled={activityBusy} className="btn-primary">{activityBusy ? "Saving…" : es ? "Guardar actividad realizada" : "Save actual activity"}</button>
          </form>
        )}

        {showForm && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Add Event</h2>
            <form
              onSubmit={addEvent}
              className="grid md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label className="label">Title</label>
                <input
                  className="input"
                  value={evForm.title}
                  onChange={(e) =>
                    setEvForm({ ...evForm, title: e.target.value })
                  }
                  placeholder="Race, appointment…"
                  required
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={evForm.date}
                  onChange={(e) =>
                    setEvForm({ ...evForm, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Type</label>
                <select
                  className="input"
                  value={evForm.type}
                  onChange={(e) =>
                    setEvForm({ ...evForm, type: e.target.value })
                  }
                >
                  <option value="workout">Workout</option>
                  <option value="race">Race</option>
                  <option value="appointment">Appointment</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <button type="submit" className="btn-primary justify-center">
                Add
              </button>
            </form>
          </div>
        )}

        {/* Week strip: previous month → next week, today pinned in view */}
        <div className="card">
          <h2 className="font-display font-bold text-sm mb-2 text-slate-500 uppercase tracking-wide">
            Your weeks — last month to next week
          </h2>
          <WeekStrip
            workouts={stripWorkouts}
            selected={selected || format(new Date(), "yyyy-MM-dd")}
            onSelect={setSelected}
          />
        </div>

        {/* DEFAULT VIEW — 3 big days (yesterday · today · tomorrow), scroll
            sideways for the following two weeks. Bigger, easier to read than
            the month grid; toggle below keeps Month available. */}
        <div className="card p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-sm text-slate-500 uppercase tracking-wide">
              {es ? "Próximos días — desliza →" : "Your days — scroll sideways →"}
            </h2>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  const el = document.getElementById("days-scroller");
                  el?.scrollTo({ left: 0, behavior: "smooth" });
                }}
                className="btn-secondary !px-3 !py-1 text-xs"
              >
                {es ? "Hoy" : "Today"}
              </button>
              <button
                onClick={() => setView("month")}
                className="btn-secondary !px-3 !py-1 text-xs"
              >
                {es ? "Ver mes" : "Month view"}
              </button>
            </div>
          </div>
          <div id="days-scroller" className="overflow-x-auto pb-2 -mx-1 px-1">
            <div className="flex gap-3" style={{ width: "max-content" }}>
              {Array.from({ length: 15 }, (_, i) => addDays(new Date(), i - 1)).map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayEvents = allEvents.filter(
                  (e) => dateKey(new Date(e.date), user?.timezone) === key,
                );
                const isToday = key === format(new Date(), "yyyy-MM-dd");
                const isYesterday = key === format(addDays(new Date(), -1), "yyyy-MM-dd");
                const label = isToday
                  ? es ? "HOY" : "TODAY"
                  : isYesterday
                    ? es ? "AYER" : "YESTERDAY"
                    : key === format(addDays(new Date(), 1), "yyyy-MM-dd")
                      ? es ? "MAÑANA" : "TOMORROW"
                      : "";
                return (
                  <div
                    key={key}
                    className={`flex-none w-[270px] sm:w-[300px] rounded-2xl border p-3 ${
                      isToday
                        ? "border-ocean-400 bg-ocean-50/60 shadow-sm"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${isToday ? "text-ocean-700" : "text-slate-700"}`}>
                          {format(day, "EEE d MMM", { locale: undefined })}
                        </span>
                        {label && (
                          <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${isToday ? "bg-ocean-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                            {label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 min-h-[90px]">
                      {dayEvents.length === 0 && (
                        <div className="text-[11px] text-slate-300 py-4 text-center">
                          {es ? "sin eventos" : "no events"}
                        </div>
                      )}
                      {dayEvents.map((e) => {
                        const isRace = e.priority != null || e.type === "race";
                        const raceBadge =
                          e.priority === 1 ? "A" : e.priority === 2 ? "B" : e.priority === 3 ? "C" : null;
                        return (
                          <div
                            key={e.id}
                            className={`rounded-xl border px-3 py-2 ${
                              isRace
                                ? e.priority === 1
                                  ? "border-vermillion-400 bg-vermillion-400/15 shadow-sm"
                                  : e.priority === 2
                                    ? "border-amber-300 bg-amber-50"
                                    : "border-slate-300 bg-slate-100"
                                : e.type === "appointment"
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="text-sm font-semibold leading-tight flex items-center gap-1.5">
                              {raceBadge && (
                                <span
                                  className={`text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center shrink-0 ${
                                    raceBadge === "A"
                                      ? "bg-vermillion-500 text-white"
                                      : raceBadge === "B"
                                        ? "bg-amber-500 text-white"
                                        : "bg-slate-500 text-white"
                                  }`}
                                >
                                  {raceBadge}
                                </span>
                              )}
                              <span className="truncate">{"priority" in e ? `🏁 ${e.name}` : e.title}</span>
                            </div>
                            {"planned" in e && dateKey(new Date(e.date), user?.timezone) <= dateKey(new Date(), user?.timezone) && <button type="button" className="btn-secondary text-xs mt-2" disabled={resultBusy} onClick={() => openResult(e)}>{es ? "Editar resultado" : "Edit result"}</button>}
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {"priority" in e ? (
                                <>
                                  {e.startTime ? String(e.startTime).slice(0, 5) : ""} · {e.distance}
                                  {e.location ? ` · ${e.location}` : ""}
                                </>
                              ) : (
                                <>
                                  {e.startTime ? String(e.startTime).slice(0, 5) : ""} ·{" "}
                                  {e.durationMin ? `${e.durationMin} min` : e.type}{" "}
                                  {e.intensity ? `· ${String(e.intensity).toUpperCase()}` : ""}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        {view === "month" && (
        <div className="card p-3 md:p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold text-sm text-slate-500 uppercase tracking-wide">
              {es ? "Vista de mes" : "Month view"}
            </h2>
            <button
              onClick={() => setView("days")}
              className="btn-secondary !px-3 !py-1 text-xs"
            >
              {es ? "← Vista de 3 días" : "← 3-day view"}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="text-center text-[11px] font-semibold uppercase text-slate-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => (
              <div key={`b${i}`} />
            ))}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = events.filter(
                (e) => dateKey(new Date(e.date), user?.timezone) === key,
              );
              const dayWorkouts = workouts.filter(
                (w) => dateKey(new Date(w.date), user?.timezone) === key,
              );
              const isDayOff = plan?.days?.some(
                (d: any) =>
                  d.dayOff && dateKey(new Date(d.date), user?.timezone) === key,
              );
              const isToday = isSameDay(day, new Date());
              const inMonth = isSameMonth(day, month);
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`min-h-16 md:min-h-32 rounded-lg border p-1 text-left transition-colors cursor-pointer hover:border-ocean-400 overflow-hidden ${isToday ? "border-ocean-500 bg-ocean-50" : "border-sand-200 bg-white"} ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="text-xs font-semibold mb-1">
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1 overflow-hidden pointer-events-none">
                    {isDayOff && (
                      <div
                        className="text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 bg-slate-200 text-slate-600 font-semibold truncate"
                        title="Day off — rest, with optional comfortable movement"
                      >
                        ☁️ OFF
                      </div>
                    )}
                    {dayWorkouts.map((w) => (
                      <div
                        key={w.id}
                        className={`text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate ${SPORT_COLOR[w.sport] || "bg-slate-100 text-slate-600"} ${w.completed ? "line-through opacity-60" : ""} ${isDayOff ? "opacity-50" : ""}`}
                        title={`${w.title} — ${w.durationMin} min`}
                      >
                        <Dumbbell className="w-2.5 h-2.5 inline mr-1" />
                        {w.title.split(":").pop()?.trim().slice(0, 22)}
                      </div>
                    ))}
                    {dayEvents.map((e) => (
                      <div
                        key={e.id}
                        className="text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate bg-coral-100 text-coral-700"
                        title={`${e.title} — ${e.notes || ""}`}
                      >
                        <Flag className="w-2.5 h-2.5 inline mr-1" />
                        {e.title.slice(0, 22)}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        )}


        {/* Legend */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-ocean-500" /> Legend & Active
            Plan
          </h2>
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.entries(SPORT_COLOR).map(([sport, cls]) => (
              <span key={sport} className={`chip ${cls}`}>
                {sport}
              </span>
            ))}
            <span className="chip bg-coral-100 text-coral-700">
              event / race
            </span>
            <span className="chip bg-slate-200 text-slate-600">☁️ day off</span>
          </div>
          {plan && (
            <p className="text-sm text-slate-500 mt-3">
              Active: <strong>{plan.name}</strong> —{" "}
              {format(new Date(plan.startDate), "MMM d")} →{" "}
              {plan.raceDate
                ? format(new Date(plan.raceDate), "MMM d, yyyy")
                : "—"}{" "}
              ({plan.weeks} weeks)
            </p>
          )}
        </div>

        {/* Day detail modal */}
        {selected && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-white rounded-3xl w-full max-w-2xl my-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-sand-200 sticky top-0 bg-white rounded-t-3xl">
                <div>
                  <h2 className="font-display font-bold text-lg">
                    {format(new Date(selected + "T12:00:00"), "EEEE, MMMM d")}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {allSessions.length
                      ? `${allSessions.length} workout${allSessions.length > 1 ? "s" : ""} · tap ⏱ to move`
                      : selDayOff
                        ? "Day off"
                        : "No sessions"}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {selDayOff && !allSessions.length && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-sm">
                      ☁️{" "}
                      {dayOffProtocol(new Date(selected + "T12:00:00")).title}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {
                        dayOffProtocol(new Date(selected + "T12:00:00"))
                          .description
                      }
                    </p>
                  </div>
                )}

                {allSessions.map((s: any) => {
                  const d = workoutDetail(s, user?.profile);
                  return (
                    <div
                      key={s.id}
                      className={`rounded-2xl border p-4 ${s.completed ? "border-emerald-200 bg-emerald-50/50" : "border-sand-200"}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="font-semibold text-sm">
                          {s.completed && (
                            <CheckCircle2 className="w-4 h-4 inline text-emerald-600 mr-1" />
                          )}
                          {s.title}
                          {s.indoor && (
                            <span className="chip bg-slate-200 text-slate-600 ml-2">
                              🏠 Indoor
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {s.startTime ? `${s.startTime} · ` : ""}
                            {fmtMin(s.durationMin)} ·{" "}
                            {s.intensity?.toUpperCase() || "Z2"}
                          </span>
                          <button type="button" className="btn-secondary text-xs px-2.5 py-1.5" disabled={resultBusy || dateKey(new Date(s.date), user?.timezone) > dateKey(new Date(), user?.timezone)} onClick={() => openResult(s)}>{es ? "Editar resultado" : "Edit result"}</button>
                          <button
                            onClick={() => openMove(s)}
                            className="btn-secondary text-xs px-2.5 py-1.5"
                          >
                            <Clock className="w-3 h-3 inline mr-1" />
                            Move
                          </button>
                          <button
                            onClick={() => toggleDone(s)}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${s.completed ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                          >
                            {s.completed ? "✓ Done" : "Done"}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-ocean-50/50 p-3 space-y-1.5 text-xs">
                        <p className="text-slate-700">
                          <span className="font-bold text-ocean-700">
                            WARM-UP
                          </span>{" "}
                          — {d.wu}
                        </p>
                        <p className="text-slate-700">
                          <span className="font-bold text-ocean-700">
                            MAIN SET
                          </span>{" "}
                          — {d.main}
                        </p>
                        <p className="text-slate-700">
                          <span className="font-bold text-ocean-700">
                            COOL-DOWN
                          </span>{" "}
                          — {d.cd}
                        </p>
                        <p className="text-slate-500">🧘 {d.breathing}</p>
                        <p className="text-slate-400">📚 Study: {d.study}</p>
                      </div>
                    </div>
                  );
                })}

                {selEvents.map((e: any) => (
                  <div
                    key={e.id}
                    className="rounded-2xl border border-coral-200 bg-coral-50 p-4 text-sm"
                  >
                    <Flag className="w-4 h-4 inline text-coral-600 mr-1" />
                    <strong>{e.title}</strong>
                    {e.notes && (
                      <p className="text-xs text-slate-500 mt-1">{e.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* END month view (conditional) */}

        {/* Move workout form */}
        {moveFor && (
          <div
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setMoveFor(null)}
          >
            <div
              className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display font-bold text-lg mb-1 flex items-center gap-2">
                <Clock className="w-5 h-5 text-ocean-600" /> Move & schedule
                workout
              </h3>
              <p className="text-xs text-slate-400 mb-4">{moveFor.title}</p>
              {mutationError && <p role="alert" className="text-red-700">{mutationError}</p>}
              <div className="space-y-3">
                <div>
                  <label className="label">New date</label>
                  <input
                    type="date"
                    className="input"
                    value={moveForm.date}
                    onChange={(e) =>
                      setMoveForm({ ...moveForm, date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">
                    Start time{" "}
                    {moveForm.time ? (
                      ""
                    ) : (
                      <span className="text-slate-400">(optional)</span>
                    )}
                  </label>
                  <input
                    type="time"
                    className="input"
                    value={moveForm.time}
                    onChange={(e) =>
                      setMoveForm({ ...moveForm, time: e.target.value })
                    }
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Leave empty for a flexible day — the coach slots it around
                    your calendar.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={moveForm.indoor}
                    onChange={(e) =>
                      setMoveForm({ ...moveForm, indoor: e.target.checked })
                    }
                  />
                  <MapPin className="w-4 h-4 text-slate-400" /> Indoor training
                  (no heat adjustment)
                </div>
                {!moveForm.indoor && (
                  <div>
                    <label className="label">
                      Expected temp °C{" "}
                      <span className="text-slate-400">
                        (shows heat guidance)
                      </span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="input"
                      value={moveForm.temp}
                      onChange={(e) =>
                        setMoveForm({ ...moveForm, temp: e.target.value })
                      }
                      placeholder="e.g. 29"
                    />
                    {tempAdvice && (
                      <p className="text-xs mt-1.5 rounded-lg bg-amber-50 text-amber-700 px-2 py-1.5">
                        <Thermometer className="w-3.5 h-3.5 inline mr-1" />
                        {tempAdvice.advice}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setMoveFor(null)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={saveMove}
                  disabled={!moveForm.date}
                  className="btn-primary flex-1 justify-center"
                >
                  <Clock className="w-4 h-4" /> Move
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
