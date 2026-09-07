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
