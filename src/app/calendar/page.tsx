"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enUS, es as esLocale } from "date-fns/locale";
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
  addMonths,
  addDays,
} from "date-fns";
import { dayOffProtocol, temperatureAdjustment } from "@/lib/adaptive";
import { endpointText } from "@/lib/universal-workout-card";
import { savedCycleSummary } from "@/lib/training-cycle-summary";
import { manualWorkoutAttempt, type ManualWorkoutAttempt } from "@/lib/manual-workout-request";

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

function fmtMin(min: number, language: "en" | "es" = "en") {
  return endpointText({ endpoint: { type: "time", seconds: min * 60 } }, language);
}

export default function CalendarPage() {
  const { user } = useAuth();
  return <TrainingCalendar key={user?.id ?? "signed-out"} />;
}

function TrainingCalendar() {
  const { user } = useAuth();
  const es = user?.language === "es";
  const locale = es ? esLocale : enUS;
  const todayKey = dateKey(new Date(), user?.timezone);
  const [view, setView] = useState<"days" | "month">("days");
  const [month, setMonth] = useState(() => new Date(`${todayKey}T12:00:00`));
  const monthKey = format(month, "yyyy-MM");
  const [loadedMonth, setLoadedMonth] = useState("");
  const [loadError, setLoadError] = useState("");
  const requestId = useRef(0);
  const [events, setEvents] = useState<any[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [displayWorkouts,setDisplayWorkouts]=useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const cycleSummary = plan ? savedCycleSummary(plan, user?.timezone || "UTC") : null;
  const [showForm, setShowForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityMessage, setActivityMessage] = useState("");
  const activityAttempt=useRef<ManualWorkoutAttempt|null>(null);
  const activityInFlight=useRef(false);
  const activityUser=useRef(user?.id);
  const [resultFor, setResultFor] = useState<any>(null);
  const [resultBusy, setResultBusy] = useState(false);
  const [resultError, setResultError] = useState("");
  const [evForm, setEvForm] = useState({
    title: "",
    date: todayKey,
    type: "note",
    notes: "",
  });
  const [selected, setSelected] = useState<string | null>(null); // yyyy-MM-dd
  const dayClose = useRef<HTMLButtonElement>(null);
  const [nearby, setNearby] = useState<any[]>([]);
  const [nearbyLoaded, setNearbyLoaded] = useState(false);
  const [nearbyRest, setNearbyRest] = useState<string[]>([]);
  const [mutationError, setMutationError] = useState("");
  const [moveFor, setMoveFor] = useState<any>(null); // session being moved
  const [moveForm, setMoveForm] = useState({
    date: "",
    time: "",
    indoor: false,
    temp: "",
  });

  const load = useCallback(async (m: Date, signal?: AbortSignal) => {
    const key = format(m, "yyyy-MM");
    const id = ++requestId.current;
    setLoadError("");
    const read = async (period: string) => {
      const res = await fetch(`/api/calendar?month=${period}`, { cache: "no-store", signal });
      if (!res.ok) throw Error("Calendar unavailable");
      return res.json();
    };
    try {
      const [d, sd] = await Promise.all([read(key), read("auto").catch(() => null)]);
      if (signal?.aborted || id !== requestId.current) return;
      setEvents(d.events || []);
      setWorkouts(d.workouts || []);
      setDisplayWorkouts(d.displayWorkouts || d.workouts || []);
      setRaces(d.races || []);
      setPlan(d.plan);
      setNearby(sd ? [...(sd.events || []), ...(sd.races || []), ...(sd.displayWorkouts || sd.workouts || [])] : []);
      setNearbyLoaded(sd != null);
      setNearbyRest((sd?.plan?.days || []).filter((day: any) => day.dayOff).map((day: any) => dateKey(new Date(day.date), user?.timezone)));
      setLoadedMonth(key);
    } catch (error) {
      if (signal?.aborted || id !== requestId.current) return;
      setLoadError(es ? "No se pudo cargar el calendario." : "Could not load the calendar.");
      throw error;
    }
  }, [es, user?.timezone]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void load(month, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [user, month, load]);

  function selectDay(key: string) {
    setSelected(key);
    if (key.slice(0, 7) !== monthKey) setMonth(new Date(`${key}T12:00:00`));
  }

  useEffect(()=>{activityAttempt.current=null;activityUser.current=user?.id;},[user?.id]);
  useEffect(() => {
    if (!selected) return;
    const trigger = document.activeElement;
    dayClose.current?.focus();
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, [selected]);

  async function addUnplannedActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(activityInFlight.current)return;
    activityInFlight.current=true;
    setActivityBusy(true); setMutationError(""); setActivityMessage("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const scopeUser=activityUser.current;
    try {
      activityAttempt.current=manualWorkoutAttempt(activityAttempt.current,fields,()=>crypto.randomUUID());
      const request=activityAttempt.current;
      const res = await fetch("/api/workouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({...fields,clientRequestId:request.clientRequestId}) });
      const data = await res.json();
      if(activityUser.current!==scopeUser)return;
      if (!res.ok || data.ok!==true || typeof data.workout?.id!=="string" || !data.workout.id || data.clientRequestId!==request.clientRequestId) throw new Error(data.error || (es ? "No se pudo verificar la actividad guardada. Reintenta los mismos datos para comprobar la solicitud original." : "Could not verify the saved activity. Retry the same details to check the original request."));
      activityAttempt.current=null;
      setShowActivityForm(false);
      setActivityMessage(es ? "Actividad registrada con tus datos reales. Las sesiones planificadas no se modificaron." : "Activity saved with your reported actuals. Planned sessions were retained.");
      const observed = new Date(`${String(fields.date)}T12:00:00`);
      if (format(observed, "yyyy-MM") === monthKey) await load(observed);
      else setMonth(observed);
    } catch (error) { if(activityUser.current===scopeUser)setMutationError((error as Error).message); } finally { activityInFlight.current=false;setActivityBusy(false); }
  }

  useEffect(() => {
    if (resultFor) document.getElementById("session-result-outcome")?.focus();
  }, [resultFor]);

  function openResult(session: any) {
    setResultError(""); setActivityMessage(""); setMutationError("");
    if (session.matchedPlanId) {
      const actual = [...workouts, ...allSessions].find(item => item.id === session.matchedPlanId && !item.matchedPlanId);
      if (!actual) {
        setResultFor(null);
        setMutationError(es ? "Esta sesión está vinculada a una actividad importada. Abre la fecha de esa actividad y edita su resultado; el plan no se cuenta otra vez en JStress." : "This plan is linked to an imported activity. Open that activity's date and edit its result; the plan is not counted again in JStress.");
        return;
      }
      setActivityMessage(es ? "Editando la actividad importada vinculada. El plan se conserva y no se cuenta dos veces." : "Editing the linked imported activity. Its plan is retained and is not counted twice.");
      setSelected(null);
      setResultFor(actual);
      return;
    }
    setSelected(null);
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
    setMutationError("");
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evForm),
      });
      const data = await res.json();
      if (!res.ok || data.ok !== true || !data.event?.id) throw Error(data.error || (es ? "No se pudo guardar el evento." : "Could not save the event."));
      setShowForm(false);
      setEvForm({
        title: "",
        date: todayKey,
        type: "note",
        notes: "",
      });
      setActivityMessage(es ? "Evento guardado." : "Event saved.");
      void load(month).catch(() => {});
    } catch (error) {
      setMutationError((error as Error).message);
    }
  }

  async function api(body: any) {
    setMutationError("");
    try {
      const res = await fetch("/api/plan", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
      const data = await res.json();
      if (!res.ok || data.ok !== true || data.workout?.id !== body.sessionId) throw Error(data.error || (es ? "No se pudo verificar el cambio." : "Could not verify the change."));
      return true;
    } catch(error) {setMutationError((error as Error).message);return false;}
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
      void load(month).catch(() => {});
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

  const agendaEntries = new Map<string, any>();
  for (const entry of [...nearby.filter(entry => (entry.dateKey || dateKey(new Date(entry.date), user?.timezone)).slice(0, 7) !== loadedMonth), ...events, ...races, ...displayWorkouts]) {
    const type = entry.calendarState ? "workout" : "priority" in entry ? "race" : "event";
    agendaEntries.set(`${type}:${entry.id}`, entry);
  }
  const calendarReady = loadedMonth === monthKey && !loadError;
  const nextSevenDays = Array.from({ length: 7 }, (_, index) => addDays(new Date(`${todayKey}T12:00:00`), index));

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
    ? [...events, ...races].filter(
        (e) => (e.dateKey || dateKey(new Date(e.date), user?.timezone)) === selected,
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
        <header className="space-y-3">
          <h1 className="font-display text-2xl font-bold">{es ? "Calendario de entrenamiento" : "Training Calendar"}</h1>
          <nav className="flex flex-wrap gap-2" aria-label={es ? "Navegación de entrenamiento" : "Training navigation"}>
            <a href="/today" className="btn-primary min-h-11">{es ? "Entrenamiento de hoy" : "Today’s workout"}</a>
            <a href="/training" className="btn-secondary min-h-11">{es ? "Mi ciclo" : "My cycle"}</a>
            <a href="/coach" className="btn-secondary min-h-11">{es ? "Preguntar a Koach" : "Ask Koach"}</a>
          </nav>
          <div className="flex flex-wrap gap-2" role="group" aria-label={es ? "Vista del calendario" : "Calendar view"}>
            <button type="button" aria-pressed={view === "days"} onClick={() => { setView("days"); setSelected(null); const current = new Date(`${todayKey}T12:00:00`); if (monthKey !== todayKey.slice(0, 7)) setMonth(current); }} className={view === "days" ? "btn-primary min-h-11" : "btn-secondary min-h-11"}>{es ? "Próximos 7 días" : "Next 7 days"}</button>
            <button type="button" aria-pressed={view === "month"} onClick={() => { setView("month"); setSelected(null); }} className={view === "month" ? "btn-primary min-h-11" : "btn-secondary min-h-11"}>{es ? "Mes" : "Month"}</button>
          </div>
        </header>
        {loadError ? <div role="alert" className="card space-y-2"><p>{loadError}</p><button type="button" className="btn-secondary" onClick={() => { void load(month).catch(() => {}); }}>{es ? "Reintentar" : "Retry"}</button></div>
          : !calendarReady && <p role="status">{es ? "Cargando calendario…" : "Loading calendar…"}</p>}

        <div className="flex items-center justify-between flex-wrap gap-3">

          <div className="flex items-center gap-2 flex-wrap">
            {view === "month" && <>
              <button onClick={() => setMonth(addMonths(month, -1))} aria-label={es ? "Mes anterior" : "Previous month"} className="btn-secondary min-h-11 min-w-11 p-2"><ChevronLeft className="w-4 h-4" /></button>
              <span className="font-display font-bold text-lg capitalize">{format(month, "MMMM yyyy", { locale })}</span>
              <button onClick={() => setMonth(addMonths(month, 1))} aria-label={es ? "Mes siguiente" : "Next month"} className="btn-secondary min-h-11 min-w-11 p-2"><ChevronRight className="w-4 h-4" /></button>
              <button onClick={() => selectDay(todayKey)} className="btn-secondary min-h-11">{es ? "Hoy" : "Today"}</button>
            </>}

            <button onClick={() => setShowActivityForm(!showActivityForm)} className="btn-secondary"><Plus className="w-4 h-4" />{es ? "Registrar actividad" : "Log actual activity"}</button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" /> {es ? "Añadir evento" : "Add event"}
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
            <fieldset disabled={activityBusy} className="space-y-3 min-w-0">
            <legend className="sr-only">{es ? "Informe de actividad realizada" : "Actual activity report"}</legend>
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
            <button type="submit" disabled={activityBusy} className="btn-primary">{activityBusy ? (es ? "Guardando…" : "Saving…") : es ? "Guardar actividad realizada" : "Save actual activity"}</button>
            </fieldset>
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

        {view === "days" && calendarReady && (
          <section className="space-y-2" aria-label={es ? "Agenda de entrenamiento" : "Training agenda"}>
            {nextSevenDays.map(day => {
              const key = format(day, "yyyy-MM-dd");
              const isToday = key === todayKey;
              const entries = [...agendaEntries.values()].filter(entry => (entry.dateKey || dateKey(new Date(entry.date), user?.timezone)) === key);
              const rest = key.slice(0, 7) === loadedMonth ? plan?.days?.some((d: any) => d.dayOff && dateKey(new Date(d.date), user?.timezone) === key) : nearbyRest.includes(key);
              return <button type="button" key={key} onClick={() => selectDay(key)} aria-haspopup="dialog" className={`w-full rounded-xl border px-4 py-3 text-left hover:border-ocean-400 ${isToday ? "border-ocean-300 bg-ocean-50" : "border-sand-200 bg-white"}`}>
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <strong className="capitalize">{isToday ? (es ? "Hoy" : "Today") : format(day, "EEEE", { locale })} · {format(day, "d MMM", { locale })}</strong>
                  <span className="text-sm text-ocean-700">{es ? "Ver día" : "View day"} →</span>
                </span>
                {rest && <span className="mt-2 block text-sm font-medium text-slate-700">{es ? "Descanso planificado" : "Planned rest"}</span>}
                {entries.length ? <span className="mt-1 block space-y-1">{entries.map(entry => {
                  const workout = Boolean(entry.calendarState) || "planned" in entry;
                  const reported = entry.calendarState === "reported" || entry.completed || entry.feedbackStatus != null;
                  const review = entry.calendarState === "review";
                  const actual = entry.actualDurationMin ?? (entry.completed && entry.planned === false ? entry.durationMin : null);
                  const minutes = reported ? actual : entry.durationMin;
                  const label = !workout ? ("priority" in entry || entry.type === "race" ? (es ? "Carrera" : "Race") : (es ? "Evento" : "Event"))
                    : review ? (es ? "Revisar fuentes" : "Review sources") : reported ? (es ? "Registrado" : "Logged") : entry.planned ? (es ? "Planificado" : "Planned") : (es ? "Sin confirmar" : "Unconfirmed");
                  return <span key={`${label}:${entry.id}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className={`rounded px-1.5 text-xs font-medium ${SPORT_COLOR[entry.sport] || "bg-slate-100 text-slate-700"}`}>{label}</span>
                    <span className="min-w-0 break-words">{entry.name || entry.title}</span>
                    {workout && !review && minutes != null && <span className="text-slate-600">{fmtMin(minutes, es ? "es" : "en")}</span>}
                  </span>;
                })}</span> : !rest && <span className="block text-sm text-slate-600">{key.slice(0, 7) === loadedMonth || nearbyLoaded ? (es ? "Sin sesiones ni eventos" : "No sessions or events") : (es ? "Abre el día para cargarlo" : "Open day to load")}</span>}
              </button>;
            })}
          </section>
        )}

        {/* Calendar grid */}
        {view === "month" && calendarReady && (
        <div className="card p-3 md:p-5">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {(es ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]).map((d) => (
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
              const dayEvents = [...events, ...races].filter(
                (e) => (e.dateKey || dateKey(new Date(e.date), user?.timezone)) === key,
              );
              const dayWorkouts = displayWorkouts.filter(
                (w) => dateKey(new Date(w.date), user?.timezone) === key,
              );
              const isDayOff = plan?.days?.some(
                (d: any) =>
                  d.dayOff && dateKey(new Date(d.date), user?.timezone) === key,
              );
              const isToday = key === todayKey;
              const inMonth = isSameMonth(day, month);
              return (
                <button
                  key={key}
                  onClick={() => selectDay(key)}
                  aria-haspopup="dialog"
                  aria-label={`${format(day, "PPP", { locale })} · ${dayWorkouts.length} ${es ? "sesiones" : "sessions"} · ${dayEvents.length} ${es ? "eventos" : "events"}${isDayOff ? (es ? " · Descanso" : " · Rest") : ""}`}
                  className={`min-h-16 md:min-h-32 rounded-lg border p-1 text-left transition-colors cursor-pointer hover:border-ocean-400 overflow-hidden ${isToday ? "border-ocean-500 bg-ocean-50" : "border-sand-200 bg-white"} ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="text-xs font-semibold mb-1">
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1 overflow-hidden pointer-events-none">
                    {isDayOff && !dayWorkouts.some(w=>w.calendarState==='reported'||w.calendarState==='review') && (
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
                        title={`${w.title} — ${w.calendarState||''} · ${w.source||'JMM'}${w.durationMin!=null?' · '+fmtMin(w.durationMin, es ? "es" : "en"):''}`}
                      >
                        <Dumbbell className="w-2.5 h-2.5 inline mr-1" />
                        {w.title.split(":").pop()?.trim().slice(0, 22)}
                      </div>
                    ))}
                    {dayEvents.map((e) => (
                      <div
                        key={e.id}
                        className="text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate bg-coral-100 text-coral-700"
                        title={e.name || e.title}
                      >
                        <Flag className="w-2.5 h-2.5 inline mr-1" />
                        {(e.name || e.title || "").slice(0, 22)}
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
        <details className="card space-y-3">
          <summary className="cursor-pointer min-h-11 content-center font-semibold">
            <CalendarDays className="inline w-4 h-4 mr-2 text-ocean-600" />{es ? "Plan, leyenda y exportación" : "Plan, legend and export"}
          </summary>
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
          {plan && cycleSummary && (
            <p className="text-sm text-slate-500 mt-3">
              {es ? "Plan guardado:" : "Saved plan:"} <strong>{plan.name}</strong> —{" "}
              {cycleSummary.start} → {cycleSummary.end}{" "}
              ({cycleSummary.weeks} {es ? "semanas" : "weeks"})
              {cycleSummary.raceDate && <span className="block">{es ? "Evento principal:" : "Primary event:"} {cycleSummary.raceDate}</span>}
            </p>
          )}
          <a className="btn-secondary min-h-11" href="/api/training/export?format=ics">{es ? "Descargar calendario (.ics)" : "Download calendar (.ics)"}</a>
          <p className="text-sm text-slate-600">{es ? "Copia del plan guardado. No sincroniza ni envía al reloj; importar dos veces puede duplicar eventos." : "A copy of the saved plan. It does not sync or send to a watch; importing twice can duplicate events."}</p>
        </details>

        {/* Day detail modal */}
        {selected && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4"
            onClick={() => setSelected(null)}
          >
            <div
              role="dialog"
              aria-labelledby="calendar-day-title"
              onKeyDown={e => { if (e.key === "Escape" && !moveFor && !resultFor) setSelected(null); }}
              className="bg-white rounded-3xl w-full max-w-2xl my-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-sand-200 sticky top-0 bg-white rounded-t-3xl">
                <div>
                  <h2 id="calendar-day-title" className="font-display font-bold text-lg capitalize">
                    {format(new Date(selected + "T12:00:00"), "PPPP", { locale })}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {!calendarReady ? (loadError || (es ? "Cargando…" : "Loading…")) : allSessions.length
                      ? `${allSessions.length} ${es?'registros de sesión/fuente':'session/source records'}`
                      : selEvents.length ? (es ? "Eventos del día" : "Day events") : selDayOff
                        ? (es ? "Descanso planificado" : "Planned rest")
                        : (es ? "Sin sesiones" : "No sessions")}
                  </p>
                </div>
                <button
                  aria-label={es?'Cerrar detalles del día':'Close day details'}
                  ref={dayClose}
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {!calendarReady && loadError && <div className="p-5"><button type="button" className="btn-secondary" onClick={() => { void load(month).catch(() => {}); }}>{es ? "Reintentar" : "Retry"}</button></div>}
              {calendarReady && <div className="p-5 space-y-4">
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
                  const reported=s.calendarState==='reported'||s.completed||s.feedbackStatus!=null||s.actualDurationMin!=null;
                  const actualMinutes=s.actualDurationMin??(s.completed&&s.planned===false?s.durationMin:null);
                  return (
                    <div
                      key={s.id}
                      data-testid={`calendar-session-${s.id}`}
                      className={`rounded-2xl border p-4 ${s.completed ? "border-emerald-200 bg-emerald-50/50" : "border-sand-200"}`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="font-semibold text-sm">
                          {s.completed && (
                            <CheckCircle2 className="w-4 h-4 inline text-emerald-600 mr-1" />
                          )}
                          {s.title}
                          <span className="ml-2 text-xs text-slate-500">{reported?(es?'Informe':'Reported'):s.planned?(es?'Planificado':'Planned'):(es?'Registro':'Record')} · {s.source||'JMM'}</span>
                          {s.indoor && (
                            <span className="chip bg-slate-200 text-slate-600 ml-2">
                              🏠 Indoor
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {s.startTime ? `${s.startTime} · ` : ""}
                            {reported?actualMinutes==null?'—':fmtMin(actualMinutes, es ? "es" : "en"):fmtMin(s.durationMin, es ? "es" : "en")}{!reported&&` · ${s.intensity?.toUpperCase()||'—'}`}
                          </span>
                          {selected <= todayKey && <button type="button" className="btn-secondary text-xs min-h-11 px-2.5" disabled={resultBusy} onClick={() => openResult(s)}>{reported ? (es ? "Editar resultado" : "Edit result") : (es ? "Registrar resultado" : "Log result")}</button>}
                          {!reported&&<button
                            onClick={() => openMove(s)}
                            className="btn-secondary text-xs min-h-11 px-2.5"
                          >
                            <Clock className="w-3 h-3 inline mr-1" />
                            {es ? "Mover" : "Move"}
                          </button>}

                        </div>
                      </div>
                      {reported?<div className="rounded-xl bg-slate-50 p-3 space-y-1.5 text-xs">
                        <p>{es?'Registro informado, no una prescripción. No se infieren calentamiento, intervalos ni zonas medidas.':'Reported record, not a prescription. Warm-up, intervals and measured zones are not inferred.'}</p>
                        <p>RPE {s.rpe??'—'}/10 · HR {s.avgHr??'—'} bpm · {es?'Potencia informada':'Reported power'} {s.avgPower??'—'} W</p>
                        <p>{es?'Distancia':'Distance'} {s.distanceKm??'—'} km · {es?'Calorías informadas':'Reported calories'} {s.calories??'—'} kcal</p>
                        <p>{es?'Peso antes/después':'Weight before/after'} {s.preWeightKg??'—'} / {s.postWeightKg??'—'} kg</p>
                      </div>:<div className="rounded-xl bg-ocean-50/50 p-3 space-y-1.5 text-xs">
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
                      </div>}
                    </div>
                  );
                })}

                {selEvents.map((e: any) => (
                  <div
                    key={`${"priority" in e ? "race" : "event"}:${e.id}`}
                    className="rounded-2xl border border-coral-200 bg-coral-50 p-4 text-sm"
                  >
                    <Flag className="w-4 h-4 inline text-coral-600 mr-1" />
                    <strong>{e.name || e.title}</strong>
                    {e.distance && <p className="mt-1 text-xs">{e.distance}{e.location && ` · ${e.location}`}</p>}
                    {"priority" in e && <a href="/race-prediction" className="mt-1 inline-block underline text-ocean-700">{es ? "Abrir escenarios de carrera" : "Open race scenarios"}</a>}
                    {e.notes && (
                      <p className="text-xs text-slate-500 mt-1">{e.notes}</p>
                    )}
                  </div>
                ))}
              </div>}
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
