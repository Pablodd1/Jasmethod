"use client";

import { useState } from "react";
import { coachMetricFocus, coachMetricGuides } from "@/lib/coach-metric-guide";
import type { CycleBaselineReview } from "@/lib/cycle-review";
import type { SportHeartRateReference } from "@/lib/sport-heart-rate";
import { fmtDistance, fmtPace, fmtSwimPace, fmtSpeed, type UnitSystem } from "@/lib/units";
import { dateKey } from "@/lib/dates";
import type { sportEvidence } from "@/lib/sport-evidence";
import { JMetricsCard, type JMetrics } from "./j-metrics-card";

export type CoachMetricReviewData = {
  jMetrics: JMetrics | null;
  loadUnavailableReason: string | null;
  references: CycleBaselineReview[];
  heartRate: SportHeartRateReference[];
  observations: Pick<ReturnType<typeof sportEvidence>[number], "sport" | "latest">[];
};

const referenceSource: Record<CycleBaselineReview["source"], string> = {
  measured_test: "Applied field test",
  estimated_from_5k_test: "Estimate from an applied 5K test",
  swim_field_test_reference: "Applied CSS field test",
  athlete_reported_reference: "Athlete-reported reference",
  unavailable: "No dated reference",
};
const sportNames: Record<string, string> = { run: "Run", bike: "Bike", swim: "Swim", hyrox: "HYROX" };

export function CoachMetricReview({ data, goal, units }: {
  data: CoachMetricReviewData; goal?: string | null; units: UnitSystem;
}) {
  const [sport, setSport] = useState(() => coachMetricFocus(goal));
  const guide = sport ? coachMetricGuides[sport] : null;
  const visibleSports = sport === "triathlon" ? ["swim", "bike", "run"]
    : sport === "hyrox" ? ["run", "hyrox"] : [sport];
  const references = data.references.filter(reference => visibleSports.includes(reference.sport));
  const heartRate = data.heartRate.filter(reference => visibleSports.includes(reference.sport));
  const observations = data.observations.filter(observation => visibleSports.includes(observation.sport));
  return <div className="space-y-4">
    <section className="card space-y-3" aria-label="Sport-specific metric review">
      <h2 className="font-display text-xl font-bold">What to review for this sport</h2>
      <label className="block text-sm">
        Sport or session focus
        <select className="input mt-1 max-w-xs" value={sport} onChange={event => setSport(event.target.value as typeof sport)}>
          <option value="">Choose a sport</option>
          {Object.entries(coachMetricGuides).map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}
        </select>
      </label>
      {guide && <>
        <p className="text-sm">{guide.review}</p>
        <p className="text-sm"><strong>When it helps.</strong> {guide.when}</p>
        {(references.length > 0 || heartRate.length > 0) && <ul className="rounded-lg border p-3 space-y-2 text-sm" aria-label="Dated athlete references">
          {references.map(reference => {
            const value = reference.value == null ? "—" : reference.sport === "run" ? fmtPace(reference.value, units)
              : reference.sport === "swim" ? fmtSwimPace(reference.value, units) : `${reference.value} W`;
            return <li key={reference.sport}>
              <strong>{reference.label}</strong> · {value} · {referenceSource[reference.source]}
              {reference.observedAt && ` · ${reference.observedAt}`}
              {reference.status === "expired" && " · Expired for workout targets"}
              {reference.status === "review_due" && " · Review due"}
            </li>;
          })}
          {heartRate.map(reference => <li key={`${reference.sport}:${reference.metric}`}>
            <strong>{sportNames[reference.sport]} {reference.metric === "maxHr" ? "maximum HR" : "threshold HR"}</strong> · {reference.value} bpm · Athlete-reported reference · {reference.observedAt}
          </li>)}
        </ul>}
        {observations.length > 0 && <details className="text-sm">
          <summary className="cursor-pointer underline">Latest available session observations</summary>
          <p className="mt-2">Each value comes from its own dated session. Compare similar sessions before interpreting change.</p>
          <ul className="mt-2 space-y-1">{observations.flatMap(({ sport: key, latest }) => {
            const speed = latest.averageSpeedKmh;
            const power = latest.avgPower;
            const hr = latest.avgHr;
            const distance = latest.distanceKm;
            const cadence = latest.cadence;
            const pool = latest.poolLengthM;
            const speedLabel = key === "bike" ? "average speed" : "average pace";
            const speedValue = !speed?.value ? null : key === "run" ? fmtPace(3600 / speed.value, units)
              : key === "swim" ? fmtSwimPace(360 / speed.value, units) : fmtSpeed(speed.value, units);
            const rows = [
              { label: speedLabel, datum: speed, value: speedValue },
              { label: "distance", datum: distance, value: distance?.value == null ? null : key === "swim" ? `${Math.round(distance.value * (units === "imperial" ? 1000 / 0.9144 : 1000))} ${units === "imperial" ? "yd" : "m"}` : fmtDistance(distance.value, units) },
              ...(key === "bike" ? [
                { label: "average power", datum: power, value: power ? `${power.value} W` : null },
                { label: "cadence", datum: cadence, value: cadence ? `${cadence.value} rpm` : null },
              ] : []),
              ...(key === "swim" ? [{ label: "pool length", datum: pool, value: pool ? `${pool.value} m` : null }] : []),
              { label: "average HR", datum: hr, value: hr ? `${hr.value} bpm` : null },
            ];
            return rows.map(({ label, datum, value }) => <li key={`${key}:${label}`}>
              <strong>{sportNames[key]} {label}</strong> · {datum && value
                ? `${value} · ${dateKey(new Date(datum.observedAt), data.jMetrics?.timezone)} · ${datum.source}${datum.calculated ? " · Calculated" : ""}${datum.calculated && datum.precision === "whole_minutes" ? " from whole minutes" : ""}`
                : "— No usable observation in this period"}
            </li>);
          })}</ul>
        </details>}
        <details className="text-sm">
          <summary className="cursor-pointer underline">Research and comparison limits</summary>
          <p className="mt-2">{guide.limit}</p>
          {guide.source && <a className="underline" href={guide.source.url}>{guide.source.label}</a>}
        </details>
      </>}
    </section>
    {data.loadUnavailableReason ? <section className="card space-y-2">
      <h2 className="font-display text-xl font-bold">J Metrics</h2>
      <p role="status" className="text-sm">{data.loadUnavailableReason}</p>
    </section> : <JMetricsCard metrics={data.jMetrics} allowRestEntry={false} showAthleteLinks={false} />}
    <details className="card text-sm">
      <summary className="cursor-pointer font-semibold">How to use biometrics and reported stress</summary>
      <p className="mt-2">In Recovery, compare sleep, resting HR and HRV with the athlete’s own comparable measurements. Keep HRV method and source visible. Review self-reported stress, soreness and symptoms separately from training load. Compare changes with recent training and ask the athlete what changed before adjusting the plan.</p>
      <p className="mt-2">HRV-guided endurance studies show mixed performance results. Review symptoms directly when deciding whether training needs to pause.</p>
      <a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/34489178/">Düking et al. · HRV and endurance training review</a>
    </details>
  </div>;
}
