"use client";

import { FlaskConical, X } from "lucide-react";
import { useState } from "react";

// Small marketing banner: shown when VO2max / LTHR are not from a real test.
// Message: your numbers are estimates (validated formula from resting HR —
// Uth-Sørensen 2004, ~0.8 ml/kg/min accuracy); get the real ones via the
// 20-min field test (Labs) or a lab test. Dismissible per device.
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
            : "LTHR estimated — a 30-min field test sets your real zones"}
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
              vo2maxMissing && "VO2max from your resting HR (Uth-Sørensen 2004 formula — accurate to ~±1 ml/kg/min, surprisingly close)",
              lthrMissing && "LTHR from your max HR",
            ]
              .filter(Boolean)
              .join(" and ")}
            . It's a good start — but one test replaces the estimate with{" "}
            <strong>your</strong> physiology:
          </p>
          <ul className="text-sm text-slate-700 mt-2 space-y-1">
            <li>
              🧪 <strong>Field test (free, 20-30 min):</strong>{" "}
              <a href="/labs" className="underline text-ocean-700">
                run it from Labs
              </a>{" "}
              — 30-min time trial for LTHR, or the 20-min protocol for VO2max.
            </li>
            <li>
              🏥 <strong>Lab test (~$100-250):</strong> the gold standard —
              lactate threshold + gas-exchange VO2max. Upload the results in{" "}
              <a href="/labs" className="underline text-ocean-700">
                Labs
              </a>{" "}
              and every zone, prescription and fuel plan recalibrates.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
