"use client";

import { useEffect, useState } from "react";

interface ProtocolItem {
  priority: number;
  reason: string;
  name: string;
  tier: string;
  evidenceScore: number;
  dose: string;
  timing: string;
  caution: string | null;
}

// Personalized supplement protocol for the athlete's chosen discipline.
// Renders nothing for anonymous visitors — it's a signed-in extra on the
// public Supplements guide.
export function SportProtocolCard() {
  const [items, setItems] = useState<ProtocolItem[] | null>(null);
  const [discipline, setDiscipline] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/supplements?mine=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.protocol?.length) {
          setItems(data.protocol);
          setDiscipline(data.discipline);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items) return null;

  return (
    <aside className="card p-5 my-8 border-l-4 border-l-brand-500">
      <p className="kicker">Your sport protocol</p>
      <h3 className="font-semibold text-lg mt-1">
        Priority stack for {DISCIPLINE_LABEL[discipline ?? ""] ?? discipline}
      </h3>
      <ol className="mt-4 space-y-3">
        {items.map((it) => (
          <li key={it.name} className="flex gap-3">
            <span className="flex-none w-6 h-6 rounded-full bg-brand-500/10 text-brand-600 text-sm font-semibold flex items-center justify-center">
              {it.priority}
            </span>
            <div>
              <p className="font-medium text-sm">
                {it.name}{" "}
                <span className="ml-1 text-xs font-normal text-ink-500">
                  {it.dose} · {it.timing}
                </span>
              </p>
              <p className="text-sm text-ink-600 mt-0.5">{it.reason}</p>
              {it.caution && (
                <p className="text-xs text-amber-700 mt-0.5">⚠ {it.caution}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="micro text-ink-500 mt-4">
        Graded by human-trial evidence · your likes/dislikes in the app tune
        daily ergogenic picks.
      </p>
    </aside>
  );
}

const DISCIPLINE_LABEL: Record<string, string> = {
  "track-sprint": "Track sprint (100–400m)",
  boxing: "Boxing",
  sprint: "Sprint triathlon",
  olympic: "Olympic triathlon",
  half: "Half-distance",
  full: "Full-distance",
  "run-only": "Running",
  "swim-only": "Swimming",
  cycle: "Cycling",
  hyrox: "HYROX",
  lifting: "Strength / lifting",
};
