"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Dumbbell, Flag } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths } from "date-fns";

const SPORT_COLOR: Record<string, string> = {
  swim: "bg-sky-100 text-sky-700",
  bike: "bg-emerald-100 text-emerald-700",
  run: "bg-orange-100 text-orange-700",
  strength: "bg-purple-100 text-purple-700",
  brick: "bg-red-100 text-red-700",
  recovery: "bg-slate-100 text-slate-600",
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [evForm, setEvForm] = useState({ title: "", date: format(new Date(), "yyyy-MM-dd"), type: "note", notes: "" });

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

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const leadingBlanks = startOfMonth(month).getDay();

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Calendar</h1>
            <p className="text-slate-500 text-sm">Planned sessions, completed workouts and events — click a day to see detail.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMonth(addMonths(month, -1))} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-display font-bold text-lg min-w-40 text-center">{format(month, "MMMM yyyy")}</div>
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
              const isToday = isSameDay(day, new Date());
              const inMonth = isSameMonth(day, month);
              return (
                <div key={key} className={`min-h-24 md:min-h-32 rounded-xl border p-1.5 transition-colors ${isToday ? "border-ocean-500 bg-ocean-50" : "border-sand-200 bg-white"} ${inMonth ? "" : "opacity-40"}`}>
                  <div className="text-xs font-semibold mb-1">{format(day, "d")}</div>
                  <div className="space-y-1 overflow-hidden">
                    {dayWorkouts.map((w) => (
                      <div key={w.id} className={`text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate ${SPORT_COLOR[w.sport] || "bg-slate-100 text-slate-600"} ${w.completed ? "line-through opacity-60" : ""}`} title={`${w.title} — ${w.durationMin} min`}>
                        <Dumbbell className="w-2.5 h-2.5 inline mr-1" />{w.title.split(":").pop()?.trim().slice(0, 22)}
                      </div>
                    ))}
                    {dayEvents.map((e) => (
                      <div key={e.id} className="text-[10px] md:text-[11px] rounded-md px-1.5 py-0.5 truncate bg-coral-100 text-coral-700" title={`${e.title} — ${e.notes || ""}`}>
                        <Flag className="w-2.5 h-2.5 inline mr-1" />{e.title.slice(0, 22)}
                      </div>
                    ))}
                  </div>
                </div>
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
          </div>
          {plan && (
            <p className="text-sm text-slate-500 mt-3">
              Active: <strong>{plan.name}</strong> — {format(new Date(plan.startDate), "MMM d")} → {plan.raceDate ? format(new Date(plan.raceDate), "MMM d, yyyy") : "—"} ({plan.weeks} weeks)
            </p>
          )}
        </div>
      </div>
    </ProtectedPage>
  );
}
