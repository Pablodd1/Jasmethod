"use client";
import { useEffect, useState } from "react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { CognitiveCheck } from "@/components/cognitive-check";
export default function Brain() {
  const { user } = useAuth(),
    [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (user)
      fetch("/api/cognitive")
        .then((r) => {
          if (!r.ok) throw Error("Could not load history");
          return r.json();
        })
        .then(setData)
        .catch((e) => setError(e.message));
  }, [user]);
  return (
    <ProtectedPage>
      <h1 className="text-3xl font-bold mb-4">Cognitive check history</h1>
      <p className="text-sm mb-5">
        Recorded practice results. Device, familiarity and distractions affect
        scores; these results do not diagnose health or determine training
        readiness.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="card">
        {data?.tests.length
          ? data.tests.map((t: any) => (
              <p key={t.id} className="py-2 border-b">
                {new Date(t.date).toLocaleDateString()} · {t.test} · {t.score}{" "}
                {t.test === "stroop" || t.test === "reaction" ? "ms" : "points"}
                {t.accuracy != null ? ` · accuracy ${t.accuracy}%` : ""}
              </p>
            ))
          : "No recorded tests yet."}
      </div>
    </ProtectedPage>
  );
}
