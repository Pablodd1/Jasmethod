"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Dumbbell, Flag, X, Clock, Thermometer, MapPin, CheckCircle2, CloudSun } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths } from "date-fns";
import { buildSessionDetail } from "@/lib/science";
import { dayOffProtocol, temperatureAdjustment } from "@/lib/adaptive";

const SPORT_COLOR: Record<string, string> = {
  swim: "bg-sky-100 text-sky-700",
  bike: "bg-emerald-100 text-emerald-700",
  run: "bg-orange-100 text-orange-700",
  strength: "bg-purple-100 text-purple-700",
  brick: "bg-red-100 text-red-700",
  recovery: "bg-slate-100 text-slate-600",
};

function fmtMin(min: number) {
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`;
  return `${min}m`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [evForm, setEvForm] = useState({ title: "", date: format(new Date(), "yyyy-MM-dd"), type: "note", notes: "" });
  const [selected, setSelected] = useState<string | null>(null); // yyyy-MM-dd
  const [moveFor, setMoveFor] = useState<any>(null); // session being moved
  const [moveForm, setMoveForm] = useState({ date: "", time: "", indoor: false, temp: "" });

  async function load(m: Date) {
    const key = format(m, "yyyy-MM");
    const res = await fetch(`/api/calendar?month=${key}`);
    const d = await res.json();
    setEvents(d.events || []);
    setWorkouts(d.workouts || []);
    setPlan(d.plan);
  }

  useEffect(() => { if (user) load(month); }, [user, month]);

  async function addEvent(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evForm),
    });
    if (res.ok) {
      setShowForm(false);
      setEvForm({ title: "", date: format(new Date(), "yyyy-MM-dd"), type: "note", notes: "" });
      load(month);
    }
  }

  async function api(body: any) {
    const res = await fetch("/api/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  }

  async function toggleDone(session: any) {
    await api({ sessionId: session.id, completed: !session.completed });
    load(month);
  }

  async function saveMove() {
    if (!moveFor || !moveForm.date) return;
    const [y, m, d] = moveForm.date.split("-").map(Number);
    const [hh, mm] = (moveForm.time || "00:00").split(":").map(Number);
    const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
    const ok = await api({ sessionId: moveFor.id, date: dt.toISOString(), indoor: moveForm.indoor });
    if (ok) { setMoveFor(null); load(month); }
  }

  function openMove(session: any) {
    const d = new Date(session.date);
    setMoveForm({ date: format(d, "yyyy-MM-dd"), time: "", indoor: Boolean(session.indoor), temp: "" });
    setMoveFor(session);
  }

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const leadingBlanks = startOfMonth(month).getDay();

  // Selected day: plan days (with notes + dayOff) + any standalone workouts
  const selDays = selected ? (plan?.days?.filter((d: any) => format(new Date(d.date), "yyyy-MM-dd") === selected) || []) : [];
  const selDayOff = selDays.some((d: any) => d.dayOff);
  const selWorkouts = selected
    ? workouts.filter((w) => format(new Date(w.date), "yyyy-MM-dd") === selected)
    : [];
  const selSessions = selDays.flatMap((d: any) => d.sessions.map((s: any) => ({ ...s, notes: s.notes || d.notes, dayOff: d.dayOff })));
  const selStandalone = selWorkouts.filter((w: any) => !selSessions.some((s: any) => s.id === w.id));
  const allSessions = [...selSessions, ...selStandalone];
  const selEvents = selected ? events.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === selected) : [];
  const tempAdvice = moveForm.temp && !moveForm.indoor ? temperatureAdjustment(parseFloat(moveForm.temp)) : null;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Calendar</h1>
            <p className="text-slate-500 text-sm">Click any day to see the full workout detail, move sessions, or mark them done.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setMonth(addMonths(month, -1))} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-display font-bold text-lg text-center">{format(month, "MMMM yyyy")}</div>
            <button onClick={() => setMonth(addMonths(month, 1))} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => { setMonth(new Date()); load(new Date()); }} className="btn-secondary text-sm">Today</button>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary"><Plus className="w-4 h-4" /> Event</button>
          </div>
        </div>

        {showForm && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Add Event</h2>
            <form onSubmit={addEvent} className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="label">Title</label>
                <input className="input" value={evForm.title} onChange={(e) => setEvForm({ ...evForm, title: e.target.value })} placeholder="Race, appointment…" required />
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={evForm.date} onChange={(e) => setEvForm({ ...evForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={evForm.type} onChange={(e) => setEvForm({ ...evForm, type: e.target.value })}>
                  <option value="workout">Workout</option>
                  <option value="race">Race</option>
                  <option value="appointment">Appointment</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <button type="submit" className="btn-primary justify-center">Add</button>
            </form>
          </div>
        )}

        {/* Calendar grid */}
        <div className="card p-3 md:p-5">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold uppercase text-slate-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayEvents = events.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === key);
              const dayWorkouts = workouts.filter((w) => format(new Date(w.date), "yyyy-MM-dd") === key);
              const isDayOff = plan?.days?.some((d: any) => d.dayOff && format(new Date(d.date), "yyyy-MM-dd") === key);
              const isToday = isSameDay(day, new Date());
              const inMonth = isSameMonth(day, month);
              return (
                <button
                  key={key}
                  onClick={() => setSelected(key)}
                  className={`min-h-24 md:min-h-32 rounded-xl border p-1.5 text-left transition-colors cursor-pointer hover:border-ocean-400 ${isToday ? "border-ocean-500 bg-ocean-50" : "border-sand-200 bg-white"} ${inMonth ? "" : "opacity-40"}`}
                >
                  <div className="text-xs font-semibold mb-1">{format(day, "d")}</div>
                  <div className="space-y-1 overflow-hidden pointer-events-none">
                    {isDayOff && (
                      <div className="text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 bg-slate-200 text-slate-600 font-semibold truncate" title="Day off — 20 min Z1 + breathing">
                        ☁️ OFF
                      </div>
                    )}
                    {dayWorkouts.map((w) => (
                      <div key={w.id} className={`text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate ${SPORT_COLOR[w.sport] || "bg-slate-100 text-slate-600"} ${w.completed ? "line-through opacity-60" : ""} ${isDayOff ? "opacity-50" : ""}`} title={`${w.title} — ${w.durationMin} min`}>
                        <Dumbbell className="w-2.5 h-2.5 inline mr-1" />{w.title.split(":").pop()?.trim().slice(0, 22)}
                      </div>
                    ))}
                    {dayEvents.map((e) => (
                      <div key={e.id} className="text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate bg-coral-100 text-coral-700" title={`${e.title} — ${e.notes || ""}`}>
                        <Flag className="w-2.5 h-2.5 inline mr-1" />{e.title.slice(0, 22)}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-ocean-500" /> Legend & Active Plan</h2>
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.entries(SPORT_COLOR).map(([sport, cls]) => (
              <span key={sport} className={`chip ${cls}`}>{sport}</span>
            ))}
            <span className="chip bg-coral-100 text-coral-700">event / race</span>
            <span className="chip bg-slate-200 text-slate-600">☁️ day off</span>
          </div>
          {plan && (
            <p className="text-sm text-slate-500 mt-3">
              Active: <strong>{plan.name}</strong> — {format(new Date(plan.startDate), "MMM d")} → {plan.raceDate ? format(new Date(plan.raceDate), "MMM d, yyyy") : "—"} ({plan.weeks} weeks)
            </p>
          )}
        </div>

        {/* Day detail modal */}
        {selected && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setSelected(null)}>
            <div className="bg-white rounded-3xl w-full max-w-2xl my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-sand-200 sticky top-0 bg-white rounded-t-3xl">
                <div>
                  <h2 className="font-display font-bold text-lg">{format(new Date(selected + "T12:00:00"), "EEEE, MMMM d")}</h2>
                  <p className="text-xs text-slate-400">{allSessions.length ? `${allSessions.length} workout${allSessions.length > 1 ? "s" : ""} · tap ⏱ to move` : selDayOff ? "Day off" : "No sessions"}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-500" /></button>
              </div>

              <div className="p-5 space-y-4">
                {selDayOff && !allSessions.length && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="font-semibold text-sm">☁️ {dayOffProtocol(new Date(selected + "T12:00:00")).title}</div>
                    <p className="text-xs text-slate-500 mt-1">{dayOffProtocol(new Date(selected + "T12:00:00")).description}</p>
                  </div>
                )}

                {allSessions.map((s: any) => {
                  const d = buildSessionDetail(
                    { sport: s.sport, type: s.type, zone: s.intensity || "z2", minutes: s.durationMin, description: s.notes || "" },
                    s.recovery || undefined,
                  );
                  return (
                    <div key={s.id} className={`rounded-2xl border p-4 ${s.completed ? "border-emerald-200 bg-emerald-50/50" : "border-sand-200"}`}>
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                        <div className="font-semibold text-sm">
                          {s.completed && <CheckCircle2 className="w-4 h-4 inline text-emerald-600 mr-1" />}
                          {s.title}
                          {s.indoor && <span className="chip bg-slate-200 text-slate-600 ml-2">🏠 Indoor</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {s.date && new Date(s.date).getHours() + new Date(s.date).getMinutes() > 0
                              ? `${format(new Date(s.date), "HH:mm")} · ` : ""}
                            {fmtMin(s.durationMin)} · {s.intensity?.toUpperCase() || "Z2"}
                          </span>
                          <button onClick={() => openMove(s)} className="btn-secondary text-xs px-2.5 py-1.5"><Clock className="w-3 h-3 inline mr-1" />Move</button>
                          <button onClick={() => toggleDone(s)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${s.completed ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}>
                            {s.completed ? "✓ Done" : "Done"}
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl bg-ocean-50/50 p-3 space-y-1.5 text-xs">
                        <p className="text-slate-700"><span className="font-bold text-ocean-700">WARM-UP</span> — {d.wu}</p>
                        <p className="text-slate-700"><span className="font-bold text-ocean-700">MAIN SET</span> — {d.main}</p>
                        <p className="text-slate-700"><span className="font-bold text-ocean-700">COOL-DOWN</span> — {d.cd}</p>
                        <p className="text-slate-500">🧘 {d.breathing}</p>
                        <p className="text-slate-400">📚 Study: {d.study}</p>
                      </div>
                    </div>
                  );
                })}

                {selEvents.map((e: any) => (
                  <div key={e.id} className="rounded-2xl border border-coral-200 bg-coral-50 p-4 text-sm">
                    <Flag className="w-4 h-4 inline text-coral-600 mr-1" /><strong>{e.title}</strong>
                    {e.notes && <p className="text-xs text-slate-500 mt-1">{e.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Move workout form */}
        {moveFor && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setMoveFor(null)}>
            <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display font-bold text-lg mb-1 flex items-center gap-2"><Clock className="w-5 h-5 text-ocean-600" /> Move workout</h3>
              <p className="text-xs text-slate-400 mb-4">{moveFor.title}</p>
              <div className="space-y-3">
                <div>
                  <label className="label">New date</label>
                  <input type="date" className="input" value={moveForm.date} onChange={(e) => setMoveForm({ ...moveForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="label">Time (optional)</label>
                  <input type="time" className="input" value={moveForm.time} onChange={(e) => setMoveForm({ ...moveForm, time: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={moveForm.indoor} onChange={(e) => setMoveForm({ ...moveForm, indoor: e.target.checked })} />
                  <MapPin className="w-4 h-4 text-slate-400" /> Indoor training (no heat adjustment)
                </div>
                {!moveForm.indoor && (
                  <div>
                    <label className="label">Expected temp °C <span className="text-slate-400">(shows heat guidance)</span></label>
                    <input type="number" step="0.1" className="input" value={moveForm.temp} onChange={(e) => setMoveForm({ ...moveForm, temp: e.target.value })} placeholder="e.g. 29" />
                    {tempAdvice && <p className="text-xs mt-1.5 rounded-lg bg-amber-50 text-amber-700 px-2 py-1.5"><Thermometer className="w-3.5 h-3.5 inline mr-1" />{tempAdvice.advice}</p>}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setMoveFor(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button onClick={saveMove} disabled={!moveForm.date} className="btn-primary flex-1 justify-center"><Clock className="w-4 h-4" /> Move</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
