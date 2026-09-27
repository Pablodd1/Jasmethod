"use client";

import { FlaskConical, X } from "lucide-react";
import { useState } from "react";

// Small marketing banner: shown when VO2max / LTHR are not from a real test.
// Estimates are provisional and cannot be presented as individual lab accuracy.
export function EstimateBanner({
  vo2maxMissing,
  lthrMissing,
  vo2maxSource,
  compact = false,
}: {
  vo2maxMissing?: boolean;
  lthrMissing?: boolean;
  vo2maxSource?: string | null;
  compact?: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  if (!vo2maxMissing && !lthrMissing) return null;

  const dismissKey = "jmm_estimate_banner_dismissed";
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(dismissKey, new Date().toISOString().slice(0, 10));
    } catch {}
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
        <FlaskConical className="w-3.5 h-3.5 flex-none text-amber-600" />
        <span>
          {vo2maxMissing
            ? vo2maxSource?.includes("rhr")
              ? "VO2max estimated from resting HR — refine it with a field test"
              : "No VO2max test yet — add a morning resting HR and we estimate it for you"
            : "LTHR estimated — review an appropriate threshold test before updating zones"}
        </span>
        <a href="/labs" className="underline font-semibold flex-none">
          Labs →
        </a>
        <button onClick={dismiss} aria-label="Dismiss" className="ml-auto flex-none">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="card border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 relative">
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-none">
          <FlaskConical className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h3 className="font-display font-bold text-base">
            {vo2maxMissing && lthrMissing
              ? "Your zones run on estimates — get your real numbers"
              : vo2maxMissing
                ? "Your VO2max is an estimate — get the real one"
                : "Your LTHR is an estimate — get the real one"}
          </h3>
          <p className="text-sm text-slate-600 mt-1 leading-snug">
            Right now we estimate{" "}
            {[
              vo2maxMissing && "VO2max from available heart-rate inputs (a provisional estimate, not a laboratory measurement)",
              lthrMissing && "LTHR from your max HR",
            ]
              .filter(Boolean)
              .join(" and ")}
            . Accuracy for an individual is uncertain. A suitable reviewed test can help establish{" "}
            <strong>your</strong> physiology:
          </p>
          <ul className="text-sm text-slate-700 mt-2 space-y-1">
            <li>
              🧪 <strong>Field assessment:</strong>{" "}
              <a href="/labs" className="underline text-ocean-700">
                run it from Labs
              </a>{" "}
              — select a test appropriate to your sport, experience and current health with your coach.
            </li>
            <li>
              🏥 <strong>Laboratory assessment:</strong> the gold standard —
              lactate threshold + gas-exchange VO2max. Upload the results in{" "}
              <a href="/labs" className="underline text-ocean-700">
                Labs
              </a>{" "}
              then review the baseline change and existing prescriptions before sending updated workouts.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
