"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Scrollable fuel & hydration timeline: carbs + fluid + sodium per segment
// across the session, over the "g/h vs hours" reference curve. Modeled on
// Fuelin's session view (what to take, when) with our per-athlete numbers.

interface Segment {
  atMin: number;
  carbsG: number;
  fluidMl: number;
  sodiumMg: number;
  label: string;
}

interface CurvePoint {
  hours: number;
  gPerHour: number;
  label: string;
}

export function FuelTimeline({
  segments,
  curve,
  carbsPerHourG,
  fluidMlPerHour,
  lang = "en",
}: {
  segments: Segment[];
  curve: CurvePoint[];
  carbsPerHourG: number;
  fluidMlPerHour: number;
  lang?: "en" | "es";
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const es = lang === "es";
  if (!segments.length) return null;

  const scroll = (dir: 1 | -1) =>
    scroller.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  // Timeline geometry: 8 px per minute, fixed bar metrics.
  const PX_PER_MIN = 8;
  const width = Math.max(320, (segments[segments.length - 1].atMin + 30) * PX_PER_MIN);
  const carbH = (g: number) => Math.min(64, g * 2.2); // bar px per g
  const height = 150;
  const baseline = height - 26;

  return (
    <div className="rounded-xl border border-ocean-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-ocean-50 border-b border-ocean-100">
        <div className="text-xs font-bold uppercase tracking-wide text-ocean-800">
          {es ? "Línea de combustible — azúcar vs horas" : "Fuel timeline — sugar vs hours"}
        </div>
        <div className="flex gap-1">
          <button onClick={() => scroll(-1)} className="p-1 rounded hover:bg-ocean-100" aria-label="scroll left">
            <ChevronLeft className="w-4 h-4 text-ocean-700" />
          </button>
          <button onClick={() => scroll(1)} className="p-1 rounded hover:bg-ocean-100" aria-label="scroll right">
            <ChevronRight className="w-4 h-4 text-ocean-700" />
          </button>
        </div>
      </div>

      <div ref={scroller} className="overflow-x-auto">
        <div style={{ width }} className="relative px-2 pt-2 pb-1">
          {/* Hour gridlines */}
            {Array.from({ length: Math.ceil(segments[segments.length - 1].atMin / 60) + 1 }, (_, h) => (
              <div
                key={h}
                className="absolute top-0 bottom-6 border-l border-dashed border-slate-200"
                style={{ left: 8 + h * 60 * PX_PER_MIN }}
              >
                <span className="absolute top-0 left-1 text-[9px] font-mono text-slate-400">
                  {h}h
                </span>
              </div>
            ))}
          <svg width={width} height={height} className="block">
            {/* carbs-per-segment bars */}
            {segments.map((s, i) => {
              const x = s.atMin * PX_PER_MIN;
              const h = carbH(s.carbsG);
              return (
                <g key={i}>
                  <rect
                    x={x - 9}
                    y={baseline - h}
                    width={18}
                    height={h}
                    rx={3}
                    className="fill-ocean-500"
                  />
                  {s.carbsG > 0 && (
                    <text x={x} y={baseline - h - 4} textAnchor="middle" className="fill-ocean-800" fontSize="9" fontWeight="700">
                      {s.carbsG}g
                    </text>
                  )}
                  {/* fluid marker: circle sized by ml */}
                  <circle
                    cx={x}
                    cy={baseline + 10}
                    r={Math.min(7, 2 + s.fluidMl / 90)}
                    className="fill-sky-400"
                  />
                  <text x={x} y={baseline + 24} textAnchor="middle" fontSize="8" className="fill-sky-700">
                    {s.fluidMl}ml
                  </text>
                </g>
              );
            })}
            <line x1={0} y1={baseline} x2={width} y2={baseline} className="stroke-slate-300" strokeWidth={1} />
          </svg>
          <div className="flex items-center gap-3 px-1 pb-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-ocean-500" /> {es ? "carbohidratos" : "carbs"} (g/{es ? "seg" : "segment"})</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400" /> {es ? "fluido" : "fluid"} (ml)</span>
            <span className="ml-auto font-mono">{carbsPerHourG} g/h · {fluidMlPerHour} ml/h</span>
          </div>
        </div>
      </div>

      {/* The g/h-vs-hours reference curve (what this session sits on) */}
      <div className="border-t border-ocean-100 px-3 py-2 bg-slate-50">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
          {es ? "Curva objetivo: g/h según duración" : "Target curve: g/h by duration"}
        </div>
        <div className="flex items-end gap-1.5">
          {curve.map((c, i) => (
            <div key={i} className="flex-1 min-w-0 text-center">
              <div className="text-[9px] font-mono text-slate-600 mb-0.5">{c.gPerHour}g/h</div>
              <div
                className={`mx-auto rounded-t ${c.gPerHour === carbsPerHourG || (i === curve.length - 1 && carbsPerHourG === c.gPerHour) ? "bg-ocean-600" : "bg-slate-300"}`}
                style={{ height: Math.max(4, c.gPerHour / 1.6), width: "70%" }}
                title={c.label}
              />
              <div className="text-[9px] font-mono text-slate-400 mt-0.5">{c.hours}h</div>
            </div>
          ))}
        </div>
        <div className="text-[9px] text-slate-400 mt-1">
          {es ? "Desliza la línea de tiempo para sesiones largas →" : "Scroll the timeline for long sessions →"}
        </div>
      </div>
    </div>
  );
}
