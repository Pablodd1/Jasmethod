"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GripVertical,
  Trash2,
  Plus,
  CalendarOff,
  Save,
  X,
  Pencil,
} from "lucide-react";

// Admin Coach Editor — full coach control over one athlete's week:
// drag sessions between days, edit/erase/add sessions, pick days off, and set
// the athlete's sport + intensity %. Every save writes to the athlete's
// permanent record and lands in their audit trail.

const LANGS_DISCIPLINES = [
  { v: "track-sprint", label: "Track Sprint (100–400m)" },
  { v: "sprint", label: "Sprint triathlon" },
  { v: "olympic", label: "Olympic triathlon" },
  { v: "half", label: "Half-distance" },
  { v: "full", label: "Full-distance" },
  { v: "run-only", label: "Run only" },
  { v: "swim-only", label: "Swim only" },
  { v: "cycle", label: "Cycling" },
  { v: "hyrox", label: "HYROX" },
];

const SPORTS = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox"];
const TYPES = ["interval", "tempo", "threshold", "endurance", "recovery", "strength", "skill", "race", "test", "speed", "plyo", "volume"];
const ZONES = ["z1", "z2", "z3", "z4", "z5", "z6", "z7"];

interface W {
  id: string;
  date: string; // ISO
  title: string;
  sport: string;
  type: string;
  durationMin: number;
  intensity?: string | null;
  startTime?: string | null;
  planned: boolean;
  completed: boolean;
  revision?: string;
  feedbackStatus?: string | null;
  feedbackAt?: string | null;
  actualDurationMin?: number | null;
}

export function AdminCoachEditor({
  athleteId,
  timezone,
  lang = "en",
  profile,
  profileRevision,
  workouts,
  onRefresh,
}: {
  athleteId: string;
  timezone: string;
  lang?: "en" | "es";
  profile: { goal?: string | null; intensityPct?: number | null; weeklyHours?: number; experience?: string } | null;
  profileRevision?: string;
  workouts: W[];
  onRefresh: () => void;
}) {
  const [editRevision, setEditRevision] = useState(profileRevision);
  const [goal, setGoal] = useState(profile?.goal || "");
  const [pct, setPct] = useState(String(profile?.intensityPct ?? 100));
  const [hours, setHours] = useState(String(profile?.weeklyHours ?? 8));
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);

  useEffect(() => {
    setGoal(profile?.goal || ""); setPct(String(profile?.intensityPct ?? 100));
    setHours(String(profile?.weeklyHours ?? 8)); setEditRevision(profileRevision);
  }, [profileRevision]);
  const hasHistory = (w: W) => w.completed || !w.planned || Boolean(w.feedbackStatus || w.feedbackAt) || w.actualDurationMin != null;

  // Group workouts onto the 7 upcoming days (local to the ATHLETE's timezone —
  // approximate with the server-passed ISO dates; keys from the date part).
  const days = useMemo(() => {
    const out: { key: string; label: string; items: W[] }[] = [];
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayKey = fmt.format(now);
    const base = new Date(`${todayKey}T12:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push({
        key,
        label: new Intl.DateTimeFormat(lang === "es" ? "es" : "en", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(d),
        items: [],
      });
    }
    for (const w of workouts) {
      const key = fmt.format(new Date(w.date));
      const day = out.find((d) => d.key === key);
      if (day) day.items.push(w);
    }
    return out;
  }, [workouts, timezone, lang]);

  async function call(payload: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/athletes/${athleteId}/editor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Change failed");
        return false;
      }
      onRefresh();
      return true;
    } catch (error) {
      setErr((error as Error).message || "Change failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    const ok = await call({
      action: "setProfile",
      expectedRevision: editRevision,
      goal: goal || null,
      intensityPct: Number(pct),
      weeklyHours: Number(hours),
    });
    if (ok)
      setProfileMsg(
        lang === "es"
          ? "Guardado en el registro permanente del atleta."
          : "Saved to the athlete's permanent record."
      );
    setSavingProfile(false);
    setTimeout(() => setProfileMsg(null), 4000);
  }

  function onDrop(dayKey: string) {
    if (!dragId) return;
    const w = workouts.find((x) => x.id === dragId);
    setDragId(null);
    if (!w || hasHistory(w) || busy) return;
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const fromKey = fmt.format(new Date(w.date));
    if (fromKey === dayKey) return;
    void call({ action: "moveWorkout", workoutId: w.id, expectedRevision: w.revision, date: dayKey });
  }

  return (
    <div className="space-y-4">
      {/* Profile controls */}
      <div className="card border-ocean-200">
        <h3 className="font-display font-bold text-base mb-3">
          {lang === "es" ? "Control del entrenador" : "Coach controls"}{" "}
          <span className="text-xs font-normal text-slate-500">
            — {lang === "es" ? "se guarda en el registro permanente" : "persists to the athlete's permanent record"}
          </span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Sport / goal</label>
            <select className="input" value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="">—</option>
              {LANGS_DISCIPLINES.map((d) => (
                <option key={d.v} value={d.v}>{d.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Intensity %</label>
            <input type="number" min={50} max={130} step={5} className="input" value={pct} onChange={(e) => setPct(e.target.value)} />
            <div className="text-[10px] text-slate-400 mt-1">100 = as planned · 80 eases · 120 sharpens</div>
          </div>
          <div>
            <label className="label">Weekly hours</label>
            <input type="number" min={1} max={40} className="input" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <button onClick={saveProfile} disabled={savingProfile || busy || !editRevision} className="btn-primary justify-center">
            <Save className="w-4 h-4" /> {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </div>
        {profileMsg && <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-3">{profileMsg}</div>}
      </div>

      {/* Week board */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-base">
            {lang === "es" ? "Semana — arrastra, edita, borra" : "Week — drag, edit, erase"}
          </h3>
          <span className="text-xs text-slate-400">{lang === "es" ? "arrastra una sesión a otro día" : "drag a session to another day"}</span>
        </div>
        {err && <div className="text-sm text-vermillion-600 bg-vermillion-400/10 rounded-lg px-3 py-2 mb-3">{err}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {days.map((d) => (
            <div
              key={d.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(d.key)}
              className={`rounded-xl border p-2 min-h-[150px] ${dragId ? "border-dashed border-ocean-400 bg-ocean-50/40" : "border-slate-200 bg-paper-50"}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{d.label}</span>
                <div className="flex gap-1">
                  <button
                    title={lang === "es" ? "Día libre" : "Day off"}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                    onClick={() => call({ action: "setDayOff", date: d.key, dayOff: true })}
                  >
                    <CalendarOff className="w-3.5 h-3.5" />
                  </button>
                  <button title={lang === "es" ? "Permitir entrenamiento" : "Allow training on this day"} disabled={busy} className="px-1 rounded hover:bg-slate-200 text-[10px] text-slate-500" onClick={() => call({ action: "setDayOff", date: d.key, dayOff: false })}>On</button>
                  <button
                    title={lang === "es" ? "Vaciar día" : "Clear day"}
                    className="p-1 rounded hover:bg-slate-200 text-slate-500"
                    onClick={() => confirm(`Clear all planned sessions on ${d.key}?`) && call({ action: "clearDay", date: d.key, revisions: Object.fromEntries(d.items.map(w => [w.id, w.revision])) })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    title={lang === "es" ? "Añadir sesión" : "Add session"}
                    className="p-1 rounded hover:bg-slate-200 text-ocean-600"
                    onClick={() => setAddDay(addDay === d.key ? null : d.key)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {addDay === d.key && (
                <AddForm
                  date={d.key}
                  busy={busy}
                  onCancel={() => setAddDay(null)}
                  onAdd={async (payload) => {
                    const ok = await call({ action: "addWorkout", date: d.key, ...payload });
                    if (ok) setAddDay(null);
                  }}
                />
              )}

              <div className="space-y-1.5">
                {d.items.map((w) =>
                  editing === w.id ? (
                    <EditForm
                      key={w.id}
                      w={w}
                      busy={busy}
                      onCancel={() => setEditing(null)}
                      onSave={async (payload) => {
                        const ok = await call({ action: "editWorkout", workoutId: w.id, ...payload });
                        if (ok) setEditing(null);
                      }}
                    />
                  ) : (
                    <div
                      key={w.id}
                      draggable={!hasHistory(w) && !busy}
                      onDragStart={() => setDragId(w.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`group rounded-lg border px-2 py-1.5 cursor-grab active:cursor-grabbing ${w.completed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex items-start gap-1">
                        <GripVertical className="w-3 h-3 text-slate-300 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{w.title}</div>
                          <div className="text-[10px] text-slate-500">
                            {w.durationMin} min · {(w.intensity || "z2").toUpperCase()} · {w.sport}
                            {w.completed ? " · ✓" : ""}
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button disabled={hasHistory(w) || busy} title={hasHistory(w) ? "Recorded session is protected" : "Edit planned session"} className="p-0.5 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30" onClick={() => setEditing(w.id)}>
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            disabled={hasHistory(w) || busy}
                            className="p-0.5 rounded hover:bg-red-100 text-red-500 disabled:opacity-30"
                            onClick={() =>
                              confirm(`Erase "${w.title}" permanently?`) && call({ action: "deleteWorkout", workoutId: w.id, expectedRevision: w.revision })
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                )}
                {!d.items.length && (
                  <div className="text-[10px] text-slate-300 text-center py-3">
                    {lang === "es" ? "sin sesiones" : "no sessions"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddForm({
  date,
  busy,
  onAdd,
  onCancel,
}: {
  date: string;
  busy: boolean;
  onAdd: (p: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState("run");
  const [type, setType] = useState("endurance");
  const [zone, setZone] = useState("z2");
  const [duration, setDuration] = useState("45");
  return (
    <div className="rounded-lg border border-ocean-300 bg-white p-2 space-y-1.5 mb-2">
      <input className="input !py-1 text-xs" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-1">
        <select className="input !py-1 text-xs" value={sport} onChange={(e) => setSport(e.target.value)}>
          {SPORTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input !py-1 text-xs" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input !py-1 text-xs" value={zone} onChange={(e) => setZone(e.target.value)}>
          {ZONES.map((s) => <option key={s}>{s.toUpperCase()}</option>)}
        </select>
        <input className="input !py-1 text-xs" type="number" min={5} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="min" />
      </div>
      <div className="flex gap-1">
        <button
          className="btn-primary flex-1 justify-center !py-1 text-xs"
          disabled={busy || !title.trim()}
          onClick={() => onAdd({ title: title.trim(), sport, type, intensity: zone, durationMin: Number(duration) })}
        >
          <Plus className="w-3 h-3" /> Add
        </button>
        <button className="btn-secondary !py-1 text-xs" onClick={onCancel}>✕</button>
      </div>
      <div className="text-[9px] text-slate-400">{date}</div>
    </div>
  );
}

function EditForm({
  w,
  busy,
  onSave,
  onCancel,
}: {
  w: W;
  busy: boolean;
  onSave: (p: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [revision] = useState(w.revision);
  const [title, setTitle] = useState(w.title);
  const [duration, setDuration] = useState(String(w.durationMin));
  const [zone, setZone] = useState((w.intensity || "z2").replace("Z", "z"));
  return (
    <div className="rounded-lg border border-ocean-300 bg-white p-2 space-y-1.5">
      <input className="input !py-1 text-xs" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-1">
        <select className="input !py-1 text-xs" value={zone} onChange={(e) => setZone(e.target.value)}>
          {ZONES.map((s) => <option key={s}>{s.toUpperCase()}</option>)}
        </select>
        <input className="input !py-1 text-xs" type="number" min={0} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} />
      </div>
      <div className="flex gap-1">
        <button
          className="btn-primary flex-1 justify-center !py-1 text-xs"
          disabled={busy}
          onClick={() => onSave({ expectedRevision: revision, title, durationMin: Number(duration), ...(zone !== (w.intensity || "z2") ? {intensity: zone} : {}) })}
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button className="btn-secondary !py-1 text-xs" onClick={onCancel}>✕</button>
      </div>
    </div>
  );
}
