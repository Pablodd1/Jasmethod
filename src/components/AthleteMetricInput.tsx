"use client";
import React, { useEffect, useRef, useState } from "react";
import { clockText, metricEntry } from "@/lib/metric-entry";

/** Invalid drafts invalidate canonical state as well, so button-based actions cannot save an old value. */
export function AthleteMetricInput({ value, onChange, clock = true, factor = 1, es = false, min = 0, max = 86400,
  id, name, label, className = "input", disabled, required, placeholder }: {
  value: string | number | null | undefined; onChange: (canonical: string) => void; clock?: boolean; factor?: number;
  es?: boolean; min?: number; max?: number; id?: string; name?: string; label?: string; className?: string;
  disabled?: boolean; required?: boolean; placeholder?: string;
}) {
  const key = (v: typeof value) => v == null || v === "" ? "" : Number.isFinite(Number(v)) ? String(Number(v)) : "invalid";
  const format = () => key(value) === "" || key(value) === "invalid" ? "" : clock ? clockText(Number(value) * factor) : String(Number((Number(value) * factor).toFixed(5)));
  const [draft, setDraft] = useState(format), [error, setError] = useState("");
  const emitted = useRef(key(value)), scope = useRef({ factor, clock }), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (key(value) !== emitted.current || scope.current.factor !== factor || scope.current.clock !== clock) {
      emitted.current = key(value); scope.current = { factor, clock }; setDraft(format()); setError(""); input.current?.setCustomValidity("");
    }
  // Scope changes redisplay the same canonical measurement; untouched values are never rounded on save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, factor, clock]);
  return <><input ref={input} id={id} aria-label={label} type="text" inputMode={clock ? "text" : "decimal"} className={className}
    disabled={disabled} required={required} value={draft} aria-invalid={!!error} placeholder={placeholder ?? (clock ? "m:ss" : undefined)}
    onChange={event => {
      const text = event.target.value; setDraft(text);
      try {
        const canonical = metricEntry(text, clock, factor), number = Number(canonical);
        if (canonical !== "" && (number < min || number > max)) throw Error("Out of range");
        emitted.current = key(canonical); input.current?.setCustomValidity(""); setError(""); onChange(canonical);
      } catch {
        const message = clock ? (es ? "Usa minutos, m:ss o h:mm:ss dentro del rango permitido." : "Use minutes, m:ss or h:mm:ss within the allowed range.")
          : (es ? "Introduce un valor válido en las unidades indicadas." : "Enter a valid value in the displayed units.");
        emitted.current = "invalid"; input.current?.setCustomValidity(message); setError(message); onChange("invalid");
      }
    }} />{name && <input type="hidden" name={name} value={value ?? ""}/>} {error && <span role="alert" className="block text-xs text-red-700">{error}</span>}</>;
}
