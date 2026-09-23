"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

export default function AdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    if (!user) return;
    const c = new AbortController();
    setError("");
    fetch(`/api/admin?page=${page}&q=${encodeURIComponent(search)}`, {
      signal: c.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => c.abort();
  }, [user, page, search]);
  return (
    <ProtectedPage>
      <div className="space-y-5">
        <div>
          <h1 className="font-display text-3xl font-bold">Coaching desk</h1>
          <p className="text-slate-500">
            All athletes · Review evidence, coordinate plans and record
            decisions.
          </p>
        </div>
        {user?.role === "admin" && <AdminOperations />}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(query);
          }}
        >
          <input
            aria-label="Search athletes"
            className="input flex-1"
            placeholder="Find athlete by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-primary">Search</button>
        </form>
        {error && (
          <p role="alert" className="card text-red-700">
            {error}
          </p>
        )}
        {!data && !error && <p role="status">Loading athletes…</p>}
        {data && (
          <>
            <p className="text-sm text-slate-500">
              {data.count} accounts · Last 30 days · Load values are estimates.
            </p>
            <div className="grid lg:grid-cols-2 gap-4">
              {data.rows.map((r: any) => (
                <Link
                  key={r.id}
                  href={`/admin/athletes/${r.id}`}
                  className="card block hover:border-ocean-500 focus:ring-2 focus:ring-ocean-500"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-lg">
                        {r.avatar} {r.name}
                      </h2>
                      <p className="text-xs text-slate-500 break-all">
                        {r.email} · {r.role}
                      </p>
                    </div>
                    <span className="text-ocean-700 text-sm">Review →</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 my-4">
                    <Stat label="Sessions" value={r.workouts30} />
                    <Stat label="Hours" value={(r.minutes30 / 60).toFixed(1)} />
                    <Stat label="Estimated load" value={r.totalTss30} />
                  </div>
                  <p className="text-sm">
                    {r.goal || "Goal not set"} ·{" "}
                    {r.experience || "Level not set"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.lastWorkoutDays === null
                      ? "No completed workout in 30 days"
                      : `Last workout ${r.lastWorkoutDays} days ago`}{" "}
                    · Check-in: {r.verdict || "No data"}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {r.connectors.map((c: any) => (
                      <span
                        key={c.provider}
                        className={`text-xs rounded px-2 py-1 ${c.lastError ? "bg-amber-50 text-amber-800" : "bg-slate-100"}`}
                      >
                        {c.provider}:{" "}
                        {c.lastError ? "needs attention" : c.status}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
            {!data.rows.length && <p className="card">No matching accounts.</p>}
            <div className="flex gap-3 items-center">
              <button
                className="btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} / {Math.max(1, data.pages)}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// ---- Admin operations: exception inbox + coach lifecycle + pilot outcomes ----
function AdminOperations() {
  const [inbox, setInbox] = useState<any>(null);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [pilot, setPilot] = useState<any>(null);
  const [ops, setOps] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(true);

  async function load() {
    const [i, c, p, o] = await Promise.all([
      fetch("/api/admin/inbox").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/coaches").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/pilot?days=30").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/ops?days=7").then((r) => (r.ok ? r.json() : null)),
    ]);
    setInbox(i);
    setCoaches(c?.coaches || []);
    setPilot(p);
    setOps(o);
  }
  useEffect(() => {
    load();
  }, []);

  const sevColor: Record<string, string> = {
    high: "bg-red-50 text-red-700 border-red-200",
    medium: "bg-amber-50 text-amber-800 border-amber-200",
    low: "bg-slate-50 text-slate-600 border-slate-200",
  };

  return (
    <div className="space-y-4">
      {/* Exception inbox */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Exception inbox</h2>
          <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => setOpen(!open)}>
            {open ? "Hide" : `Show${inbox?.alerts?.length ? ` (${inbox.alerts.length})` : ""}`}
          </button>
        </div>
        {open && (
          <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
            {inbox?.alerts?.length ? (
              inbox.alerts.map((a: any, i: number) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 text-sm ${sevColor[a.severity] || "border-slate-200"}`}>
                  <Link href={`/admin/athletes/${a.athleteId}`} className="font-semibold hover:underline">
                    {a.avatar} {a.athlete}
                  </Link>
                  <span className="flex-1">{a.detail}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">{a.kind}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-emerald-700">✓ Nothing needs attention — every assigned athlete checked in and all devices are healthy.</p>
            )}
          </div>
        )}
      </div>

      {/* Operations & cost */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">
            Operations &amp; cost{ops ? ` — last ${ops.days}d` : ""}
          </h2>
          <button className="btn-secondary !px-3 !py-1 text-xs" onClick={() => setOpsOpen(!opsOpen)}>
            {opsOpen ? "Hide" : "Show"}
          </button>
        </div>
        {opsOpen && ops && (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                ["Errors", ops.errors.total],
                ["AI calls", ops.usage.totals.ai_calls],
                ["AI tokens", ops.usage.totals.ai_input_tokens + ops.usage.totals.ai_output_tokens],
                ["Active 24h", ops.users.activeLast24h + " / " + ops.users.total],
                ["DB size", ops.db.sizeMb != null ? ops.db.sizeMb + " MB" : "—"],
              ].map(([l, v]: any) => (
                <div key={String(l)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <div className="text-xl font-bold tabular-nums">{v}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{String(l)}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-2xl font-bold text-emerald-800">
                ≈ ${ops.usage.estimatedCostUsd}{" "}
                <span className="text-sm font-normal text-emerald-700">/ month est.</span>
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">{ops.usage.note}</div>
            </div>
            {ops.usage.perUser.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                  Top users by estimated cost
                </div>
                <div className="space-y-1">
                  {ops.usage.perUser.slice(0, 8).map((u: any) => (
                    <div key={u.userId} className="flex items-center gap-2 text-xs">
                      <span>{u.avatar}</span>
                      <span className="font-semibold flex-1 truncate">{u.name}</span>
                      <span className="text-slate-500">AI {u.ai_calls}×</span>
                      <span className="text-slate-500">sync {u.db_rows_synced}</span>
                      <span className="font-semibold tabular-nums">${u.estimatedCostUsd}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ops.crons.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                  Cron heartbeats
                </div>
                {ops.crons.map((c: any, i: number) => (
                  <div key={i} className="text-xs text-slate-600 flex gap-2">
                    <span className="font-mono">{c.route}</span>
                    <span className="text-slate-400">
                      {new Date(c.at).toLocaleString()} — {c.message.slice(0, 90)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {ops.errors.latest.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                  Latest errors/warnings
                </div>
                {ops.errors.latest.map((e: any, i: number) => (
                  <div key={i} className="text-xs text-slate-600 truncate">
                    <span className="font-mono text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>{" "}
                    <span className="font-semibold">[{e.source}]</span> {e.message.slice(0, 110)}
                  </div>
                ))}
              </div>
            )}
            {ops.db.topTables.length > 0 && (
              <div className="text-[11px] text-slate-500">
                Top tables:{" "}
                {ops.db.topTables.map((t: any) => `${t.table} ${t.mb}MB`).join(" · ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pilot outcomes */}
      {pilot?.cohort && (
        <div className="card border-emerald-200">
          <h2 className="font-display font-bold text-lg">Pilot outcomes — last {pilot.days} days</h2>
          <p className="text-xs text-slate-500 mt-0.5 mb-3">{pilot.disclaimer}</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ["Athletes", pilot.cohort.athletes],
              ["Adherence", pilot.cohort.avgAdherencePct != null ? `${pilot.cohort.avgAdherencePct}%` : "—"],
              ["Avg RPE", pilot.cohort.avgRpe ?? "—"],
              ["Symptom days", pilot.cohort.symptomDayRate != null ? `${pilot.cohort.symptomDayRate}%` : "—"],
              ["Baselines improved", `${pilot.cohort.improvingBaselines}/${pilot.cohort.trackedBaselines}`],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <div className="text-xl font-bold tabular-nums">{v}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coach management */}
      <div className="card">
        <h2 className="font-display font-bold text-lg mb-3">Coaches</h2>
        <div className="space-y-1.5 mb-3">
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
              <span>{c.avatar}</span>
              <span className="font-semibold">{c.name}</span>
              <span className="text-xs text-slate-400 flex-1 truncate">{c.email}</span>
              <span className="text-xs text-slate-500">{c.athleteCount} athletes</span>
              {c.role === "coach" && (
                <button
                  className="text-xs underline text-red-600"
                  onClick={async () => {
                    if (!confirm(`Deactivate ${c.name}? All assignments will be revoked.`)) return;
                    await fetch("/api/admin/coaches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coachId: c.id, action: "deactivate" }) });
                    load();
                  }}
                >
                  deactivate
                </button>
              )}
            </div>
          ))}
        </div>
        <CoachCreator onCreated={load} />
      </div>
    </div>
  );
}

function CoachCreator({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [temp, setTemp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-ocean-200 bg-ocean-50/40 p-3 space-y-2">
      <div className="text-xs font-bold uppercase tracking-wide text-ocean-700">Create a coach</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" type="email" placeholder="coach@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" placeholder="Temp password (8+)" value={temp} onChange={(e) => setTemp(e.target.value)} />
      </div>
      {msg && <div className="text-xs text-slate-600">{msg}</div>}
      <button
        className="btn-primary !py-1.5 text-sm"
        disabled={!name || !email || temp.length < 8}
        onClick={async () => {
          const r = await fetch("/api/admin/coaches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, tempPassword: temp }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            setMsg(`✓ ${d.coach.name} created — share the temp password privately; they change it after sign-in.`);
            setName(""); setEmail(""); setTemp("");
            onCreated();
          } else setMsg(d.error || "Failed");
        }}
      >
        Create coach account
      </button>
    </div>
  );
}
