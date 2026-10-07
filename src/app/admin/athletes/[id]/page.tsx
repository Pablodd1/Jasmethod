"use client";
import {BaselineTests} from "@/components/baseline-tests";
import { CoachingConversation } from "@/components/coaching-conversation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { dateKey } from "@/lib/dates";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { AdminCoachEditor } from "@/components/admin-coach-editor";
import { CoachAssignmentsCard } from "@/components/coach-assignments-card";
import { AdminPasswordReset } from "@/components/password-recovery";

const FIELDS: [string, string][] = [
  ["birthYear", "Birth year"],
  ["heightCm", "Height (cm)"],
  ["weightKg", "Weight (kg)"],
  ["weeklyHours", "Hours / week"],
  ["ftp", "FTP (W)"],
  ["cp", "Critical power (W)"],
  ["wPrime", "W′ (kJ)"],
  ["lthr", "Threshold HR (bpm)"],
  ["restingHr", "Resting HR (bpm)"],
  ["maxHr", "Maximum HR (bpm)"],
  ["vo2max", "VO₂max"],
  ["runPaceBase", "Run threshold (sec/km)"],
  ["swimPaceBase", "Swim threshold (sec/100m)"],
  ["hrvBaseline", "HRV baseline (ms)"],
];
const GOALS = [
  "track-sprint",
  "sprint",
  "olympic",
  "half",
  "full",
  "run-only",
  "cycle",
  "swim-only",
  "hyrox",
];
const equipment = [
  "hasHrm",
  "hasGpsWatch",
  "hasBikePowerMeter",
  "hasRunPowerMeter",
  "hasSmartTrainer",
  "hasAeroBars",
  "hasCadenceSensor",
  "hasSwimPaceTool",
  "hasBikeComputer",
];
export default function AthletePage() {
  const params = useParams<{id: string}>();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null),
    [days, setDays] = useState("30"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Overview"),
    [profile, setProfile] = useState<any>({}),
    [edit, setEdit] = useState<any>(null),
    [generate, setGenerate] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/athletes/${params.id}?days=${days}`);
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setData(d);
    setProfile(d.athlete.profile || {});
  }, [params.id, days]);
  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user, load]);
  async function save(url: string, body: any, method = "PUT") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(
        `${url}?athleteId=${encodeURIComponent(params.id)}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(url === "/api/profile" ? {...body, expectedRevision: data.profileRevision} : body),
        },
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      setMessage("Saved. The athlete sees these changes in their account.");
      setEdit(null);
      setGenerate(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProtectedPage>
      <div className="space-y-5">
        <Link href="/admin" className="text-ocean-700 text-sm">
          ← All athletes
        </Link>
        {error && (
          <p role="alert" className="card border-red-200 text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="card border-green-200 text-green-800">
            {message}
          </p>
        )}
        {!data && !error && <p>Loading athlete…</p>}
        {data && (
          <>
            {user?.role === "admin" && <AdminPasswordReset userId={params.id} email={data.athlete.email} />}
            <div className="card bg-ocean-50 border-ocean-200">
              <p className="text-xs uppercase tracking-wide">
                Coaching workspace · Signed in as {user?.name}
              </p>
              <h1 className="font-display text-3xl font-bold mt-1">
                {data.athlete.avatar} {data.athlete.name}
              </h1>
              <p className="text-sm text-slate-600 break-all">
                {data.athlete.email} · {data.athlete.timezone}
              </p>
              <p className="text-xs mt-2">
                You are editing this athlete’s data. Your identity and each
                saved change are recorded.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/protocols?athleteId=${encodeURIComponent(params.id)}`} className="btn-secondary">Training protocols</Link>
              {[
                "Overview",
                "Training",
                "Profile",
                "Recovery",
                "Records",
                "History",
              ].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "btn-primary" : "btn-secondary"}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
              <select
                aria-label="Analysis period"
                className="input !w-auto"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              >
                {[7, 30, 90, 180].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
              <a
                className="btn-secondary"
                href={`/api/training/export?athleteId=${encodeURIComponent(params.id)}`}
              >
                Download complete training export
              </a>
            </div>
            {tab === "Overview" && (
              <>
                <CoachingConversation athleteId={params.id} />
                <BaselineTests athleteId={params.id} onSaved={load} />
                <AdminCoachEditor
                  profileRevision={data.profileRevision}
                  athleteId={params.id}
                  timezone={data.athlete.timezone || "America/New_York"}
                  profile={data.athlete.profile}
                  workouts={data.workouts || []}
                  onRefresh={load}
                />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    ["Recorded sessions", data.analysis.completed],
                    ["Hours", (data.analysis.minutes / 60).toFixed(1)],
                    [
                      "Plan fulfilled",
                      data.analysis.fulfillmentPct == null
                        ? "No plan"
                        : `${data.analysis.fulfillmentPct}%`,
                    ],
                    ["Estimated load", data.analysis.estimatedLoad],
                  ].map(([l, v]) => (
                    <div key={l} className="card">
                      <p className="text-xs text-slate-500">{l}</p>
                      <p className="font-display text-3xl font-bold">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h2 className="font-bold">Decision notes</h2>
                  <p className="text-xs text-slate-500 mb-3">
                    Observations from the selected period. Verify context with
                    the athlete before changing training.
                  </p>
                  {data.analysis.insights.map((i: any) => (
                    <div
                      key={i.title}
                      className={`p-3 rounded-lg mt-2 ${i.level === "attention" ? "bg-amber-50" : "bg-slate-50"}`}
                    >
                      <strong className="text-sm">{i.title}</strong>
                      <p className="text-sm text-slate-600 mt-1">{i.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h2 className="font-bold mb-3">Completed training by day</h2>
                  <Trend
                    values={data.analysis.daily.map((d: any) => ({
                      date: d.date,
                      value: d.minutes,
                    }))}
                    unit="minutes"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    {data.analysis.measuredSessions}/{data.analysis.completed}{" "}
                    sessions have HR/power. Missing days may mean no training or
                    missing logs.
                  </p>
                </div>
                <div className="card">
                  <h2 className="font-bold">Connections</h2>
                  {data.connectors.length ? (
                    data.connectors.map((c: any) => (
                      <p key={c.provider} className="text-sm mt-2">
                        {c.provider} · {c.status} · Last success:{" "}
                        {c.lastSyncAt
                          ? new Date(c.lastSyncAt).toLocaleString()
                          : "never"}
                        {c.lastError && (
                          <span className="block text-amber-800">
                            {c.lastError}
                          </span>
                        )}
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 mt-2">
                      No connected providers. Review manual data coverage.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "Training" && (
              <>
                <div className="card flex flex-wrap justify-between gap-3">
                  <div>
                    <h2 className="font-bold">
                      {data.plan?.name || "No active plan"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Includes the selected history window and the next 28 days.
                    </p>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => setGenerate(!generate)}
                  >
                    Generate plan
                  </button>
                </div>
                {generate && (
                  <form
                    className="card space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      save("/api/plan/generate", Object.fromEntries(f), "POST");
                    }}
                  >
                    <p className="text-sm">
                      This replaces future, unfinished sessions from the current
                      active plan. Completed history is preserved.
                    </p>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <label>
                        Goal
                        <select
                          name="distance"
                          className="input"
                          defaultValue={data.athlete.profile?.goal || "olympic"}
                        >
                          {GOALS.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Weeks
                        <input
                          name="weeks"
                          type="number"
                          min="4"
                          max="30"
                          defaultValue="12"
                          className="input"
                          required
                        />
                      </label>
                      <label>
                        Start date
                        <input
                          name="startDate"
                          type="date"
                          defaultValue={data.today}
                          className="input"
                          required
                        />
                      </label>
                    </div>
                    <button disabled={busy} className="btn-primary">
                      {busy ? "Generating…" : "Generate and save"}
                    </button>
                  </form>
                )}
                {edit && (
                  <form
                    className="card space-y-3 border-ocean-300"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      save("/api/plan", {
                        sessionId: edit.id,
                        expectedRevision: edit.revision,
                        ...Object.fromEntries(f),
                      });
                    }}
                  >
                    <h2 className="font-bold">Edit session</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label>
                        Title
                        <input
                          className="input"
                          name="title"
                          defaultValue={edit.title}
                          required
                        />
                      </label>
                      <label>
                        Date
                        <input
                          className="input"
                          name="date"
                          type="date"
                          defaultValue={date(edit.date, data.athlete.timezone)}
                          required
                        />
                      </label>
                      <label>
                        Time
                        <input
                          className="input"
                          name="startTime"
                          type="time"
                          defaultValue={edit.startTime || ""}
                        />
                      </label>
                      <label>
                        Planned minutes
                        <input
                          className="input"
                          name="durationMin"
                          type="number"
                          min="0"
                          max="1440"
                          defaultValue={edit.durationMin}
                          required
                        />
                      </label>
                      <label>
                        Intensity
                        <select
                          className="input"
                          name="intensity"
                          defaultValue={edit.intensity || "z2"}
                        >
                          {[1, 2, 3, 4, 5, 6, 7].map((z) => (
                            <option key={z}>z{z}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Sport
                        <select
                          className="input"
                          name="sport"
                          defaultValue={edit.sport}
                        >
                          {[
                            "run",
                            "bike",
                            "swim",
                            "strength",
                            "mobility",
                            "recovery",
                            "hyrox",
                            "brick",
                            "other",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      Session notes
                      <textarea
                        className="input"
                        name="notes"
                        defaultValue={edit.notes || ""}
                      />
                    </label>
                    <label className="block">
                      Reason for change
                      <input
                        className="input"
                        name="reason"
                        placeholder="What decision does this change support?"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button className="btn-primary" disabled={busy}>
                        Save session
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setEdit(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                <div className="space-y-3">
                  {data.workouts.map((w: any) => (
                    <div
                      key={w.id}
                      className="card flex flex-wrap items-start justify-between gap-3"
                    >
                      <div>
                        <p className="text-xs text-slate-500">
                          {date(w.date, data.athlete.timezone)}{" "}
                          {w.startTime || ""} · {w.source || "manual"}
                        </p>
                        <h3 className="font-semibold">{w.title}</h3>
                        <p className="text-sm">
                          {w.durationMin} {w.planned ? "planned" : "recorded"}{" "}
                          min · {w.intensity?.toUpperCase()} ·{" "}
                          {w.feedbackStatus ||
                            (w.completed ? "completed" : "planned")}
                          {w.actualDurationMin != null
                            ? ` · ${w.actualDurationMin} actual min`
                            : ""}
                        </p>
                        {w.feedbackNote && (
                          <p className="text-sm mt-1">
                            Athlete feedback: {w.feedbackNote}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">
                          HR: {w.avgHr ?? "not measured"} · Power:{" "}
                          {w.avgPower ?? "not measured"} · Effort:{" "}
                          {w.rpe ?? "not reported"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn-secondary"
                          onClick={() => setEdit(w)}
                        >
                          Edit
                        </button>
                        {w.planDayId && !w.completed && (
                          <button
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() =>
                              save("/api/plan", {
                                planDayId: w.planDayId,
                                dayOff: !w.planDay?.dayOff,
                              })
                            }
                          >
                            {w.planDay?.dayOff ? "Restore day" : "Set day off"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === "Profile" && (
              <>
              {user?.role === "admin" && (
                <CoachAssignmentsCard athleteId={params.id} onChanged={load} />
              )}
              <form
                className="card space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const p: any = Object.fromEntries(f);
                  if (!p.sex) p.sex = null;
                  for (const k of [...equipment, "injured"]) p[k] = f.has(k);
                  save("/api/profile", p);
                }}
              >
                <h2 className="font-bold">Training variables and baselines</h2>
                <p className="text-sm text-slate-500">
                  Empty optional values mean unknown. Changes update the same
                  profile the athlete uses.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {FIELDS.map(([k, l]) => (
                    <label key={k} className="text-sm">
                      {l}
                      <input
                        name={k}
                        type="number"
                        step="any"
                        className="input"
                        defaultValue={profile[k] ?? ""}
                      />
                    </label>
                  ))}
                  <label>
                    Sex
                    <select
                      name="sex"
                      className="input"
                      defaultValue={profile.sex || ""}
                    >
                      <option value="">Unknown</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </label>
                  <label>
                    Race date
                    <input
                      type="date"
                      name="raceDate"
                      className="input"
                      defaultValue={
                        profile.raceDate
                          ? date(profile.raceDate, data.athlete.timezone)
                          : ""
                      }
                    />
                  </label>
                  <label>
                    Goal
                    <select
                      className="input"
                      name="goal"
                      defaultValue={profile.goal || "olympic"}
                    >
                      {GOALS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Experience
                    <select
                      className="input"
                      name="experience"
                      defaultValue={profile.experience || "beginner"}
                    >
                      {["beginner", "amateur", "advanced", "pro"].map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Training window
                    <select
                      className="input"
                      name="trainingWindow"
                      defaultValue={profile.trainingWindow || "any"}
                    >
                      {["any", "morning", "midday", "evening"].map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    name="injured"
                    type="checkbox"
                    defaultChecked={profile.injured}
                  />{" "}
                  Injury / training pause flag
                </label>
                <details>
                  <summary className="cursor-pointer">Equipment</summary>
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    {equipment.map((k) => (
                      <label key={k} className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={k}
                          defaultChecked={profile[k]}
                        />
                        {k.replace(/^has/, "").replace(/([A-Z])/g, " $1")}
                      </label>
                    ))}
                  </div>
                </details>
                <label className="block">
                  Profile notes
                  <textarea
                    name="notes"
                    className="input"
                    defaultValue={profile.notes || ""}
                  />
                </label>
                <button disabled={busy} className="btn-primary">
                  {busy ? "Saving…" : "Save athlete profile"}
                </button>
              </form>
              </>
            )}
            {tab === "Recovery" && (
              <>
                <form
                  className="card space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(
                      "/api/metrics",
                      Object.fromEntries(new FormData(e.currentTarget)),
                      "POST",
                    );
                  }}
                >
                  <h2 className="font-bold">Record recovery measurements</h2>
                  <p className="text-sm text-slate-500">
                    Use values supplied by the athlete. Manual HRV uses RMSSD;
                    Apple SDNN stays separate.
                  </p>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <label>
                      Date
                      <input
                        name="date"
                        type="date"
                        defaultValue={data.today}
                        className="input"
                        required
                      />
                    </label>
                    <label>
                      HRV (RMSSD ms)
                      <input
                        name="hrv"
                        type="number"
                        min="1"
                        max="300"
                        step="any"
                        className="input"
                      />
                    </label>
                    <label>
                      Resting HR
                      <input
                        name="restingHr"
                        type="number"
                        min="25"
                        max="150"
                        className="input"
                      />
                    </label>
                    <label>
                      Sleep hours
                      <input
                        name="sleepHours"
                        type="number"
                        min="0"
                        max="24"
                        step="0.1"
                        className="input"
                      />
                    </label>
                  </div>
                  <button disabled={busy} className="btn-primary">
                    Save measurements
                  </button>
                </form>
                <div className="card">
                  <h2 className="font-bold">Recovery observations</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm mt-4">
                      <thead>
                        <tr className="text-left">
                          <th>Date</th>
                          <th>HRV / type</th>
                          <th>Resting HR</th>
                          <th>Sleep</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.metrics.map((m: any) => (
                          <tr key={m.id} className="border-t">
                            <td className="py-2">
                              {date(m.date, data.athlete.timezone)}
                            </td>
                            <td>
                              {m.hrv ?? "—"} {m.hrvType || "unspecified"}
                            </td>
                            <td>{m.restingHr ?? "—"}</td>
                            <td>{m.sleepHours ?? "—"} h</td>
                            <td>{m.source || "manual"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!data.metrics.length && (
                    <p className="text-slate-500">
                      No recovery measurements in this period.
                    </p>
                  )}
                </div>
                <div className="card">
                  <h2 className="font-bold">Check-in history</h2>
                  {data.checkins.map((c: any) => {
                    const a = json(c.adaptation),
                      b = json(c.answers);
                    return (
                      <div key={c.id} className="border-t mt-3 pt-3 text-sm">
                        <strong>
                          {date(c.date, data.athlete.timezone)} ·{" "}
                          {a.verdict || "unknown"}
                        </strong>
                        <p>{a.message}</p>
                        <p className="text-slate-500">
                          Sleep {b.sleep}/5 · Energy {b.energy}/5 · Soreness{" "}
                          {b.soreness}/5 · Sick {b.sick ? "yes" : "no"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {tab === "Records" && (
              <>
                <div className="card">
                  <h2 className="font-bold">Races and measured results</h2>
                  {data.races.map((r: any) => (
                    <p className="text-sm py-2 border-b" key={r.id}>
                      {r.name} · {date(r.date, data.athlete.timezone)} · Goal{" "}
                      {r.goalTimeMin ?? "—"} min · Actual{" "}
                      {r.resultMin ?? "not recorded"}
                    </p>
                  ))}
                </div>
                <div className="card">
                  <h2 className="font-bold">Benchmark history</h2>
                  {data.benchmarks.map((b: any) => (
                    <p key={b.id} className="text-sm py-2 border-b">
                      {b.name} · {date(b.date, data.athlete.timezone)} ·{" "}
                      {b.result ??
                        (b.completed ? "No numeric result" : "scheduled")}
                    </p>
                  ))}
                </div>
                <div className="card">
                  <h2 className="font-bold">Latest blood panels</h2>
                  <p className="text-xs text-slate-500">
                    Values and supplied reference ranges are shown for review.
                    Units must match before comparison.
                  </p>
                  {data.blood.map((p: any) => (
                    <div className="mt-3" key={p.id}>
                      <strong>
                        {date(p.date, data.athlete.timezone)} · {p.lab}
                      </strong>
                      {p.results.map((r: any) => (
                        <p className="text-sm" key={r.id}>
                          {r.marker}: {r.value} {r.unit} · Lab range{" "}
                          {r.refLow ?? "—"}–{r.refHigh ?? "—"}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h2 className="font-bold">Recent nutrition</h2>
                  {data.nutrition.slice(0, 20).map((n: any) => (
                    <p key={n.id} className="text-sm py-1">
                      {date(n.date, data.athlete.timezone)} · {n.food} ·{" "}
                      {n.calories ?? "—"} kcal
                    </p>
                  ))}
                </div>
              </>
            )}
            {tab === "History" && (
              <div className="card">
                <h2 className="font-bold">Change history</h2>
                <p className="text-xs text-slate-500">
                  Most recent 30 changes. Records before this update may not
                  have an audit entry.
                </p>
                {data.audit.map((a: any) => (
                  <details key={a.id} className="border-t mt-3 pt-3">
                    <summary className="cursor-pointer text-sm">
                      {new Date(a.createdAt).toLocaleString()} · {a.actor.name}{" "}
                      · {a.action}
                    </summary>
                    {a.note && <p className="text-sm mt-2">{a.note}</p>}
                    <pre className="text-xs overflow-auto bg-slate-50 p-3 mt-2">
                      {JSON.stringify(
                        { before: json(a.before), after: json(a.after) },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
function json(s: string | null) {
  try {
    return JSON.parse(s || "{}") || {};
  } catch {
    return {};
  }
}
function date(value: string, tz: string) {
  return dateKey(new Date(value), tz);
}
function Trend({
  values,
  unit,
}: {
  values: { date: string; value: number }[];
  unit: string;
}) {
  if (!values.length)
    return (
      <p className="text-sm text-slate-500">
        No completed training in this period.
      </p>
    );
  const max = Math.max(1, ...values.map((v) => v.value));
  return (
    <div
      className="flex items-end gap-1 h-36"
      role="img"
      aria-label={`Training ${unit} by day`}
    >
      {values.map((v) => (
        <div
          key={v.date}
          className="flex-1 bg-ocean-500 rounded-t min-w-1"
          style={{ height: `${Math.max(2, (100 * v.value) / max)}%` }}
          title={`${v.date}: ${v.value} ${unit}`}
        />
      ))}
    </div>
  );
}
