"use client";

import { useEffect, useState } from "react";
import { UserPlus, UserMinus, RotateCcw } from "lucide-react";

// Admin-only card: manage which coaches are assigned to this athlete.
// Assignments are the permission boundary — a coach with no active
// assignment cannot see or edit the athlete anywhere in the app.
export function CoachAssignmentsCard({
  athleteId,
  onChanged,
}: {
  athleteId: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/admin/assignments?athleteId=${athleteId}`);
    if (r.ok) {
      const d = await r.json();
      setRows(d.rows || []);
      setCoaches(d.coaches || []);
    }
  }
  useEffect(() => {
    load();
  }, [athleteId]);

  async function act(action: "assign" | "revoke" | "restore", coachId: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, coachId, athleteId }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setErr(d.error || "Change failed");
      } else {
        setPick("");
        await load();
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  }

  const assigned = rows.filter((x) => x.status === "active");
  const revoked = rows.filter((x) => x.status !== "active");

  return (
    <div className="card border-ocean-200">
      <h3 className="font-display font-bold text-base mb-1">Assigned coaches</h3>
      <p className="text-xs text-slate-500 mb-3">
        A coach sees and edits only their assigned athletes. Revoking cuts
        access immediately and is recorded in the athlete&apos;s audit trail.
      </p>
      {err && <div className="text-sm text-red-600 mb-2">{err}</div>}
      <div className="space-y-1.5 mb-3">
        {assigned.length === 0 && (
          <div className="text-xs text-slate-400">No coaches assigned.</div>
        )}
        {assigned.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
            <span>{a.coach.avatar}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{a.coach.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{a.coach.email} · {a.coach.role}</div>
            </div>
            <button
              onClick={() => act("revoke", a.coachId)}
              disabled={busy}
              className="p-1.5 rounded hover:bg-red-50 text-red-500"
              title="Revoke access"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {revoked.length > 0 && (
        <details className="mb-3">
          <summary className="text-xs text-slate-400 cursor-pointer">
            {revoked.length} revoked
          </summary>
          <div className="mt-1.5 space-y-1">
            {revoked.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex-1 truncate">{a.coach.name}</span>
                <button
                  onClick={() => act("restore", a.coachId)}
                  disabled={busy}
                  className="underline"
                >
                  restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="flex gap-2">
        <select className="input flex-1" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Assign a coach…</option>
          {coaches
            .filter((c) => !assigned.some((a) => a.coachId === c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.role})
              </option>
            ))}
        </select>
        <button
          onClick={() => pick && act("assign", pick)}
          disabled={busy || !pick}
          className="btn-secondary shrink-0"
        >
          <UserPlus className="w-4 h-4" /> Assign
        </button>
      </div>
    </div>
  );
}
