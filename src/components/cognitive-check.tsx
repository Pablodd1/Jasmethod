"use client";
// Random stimuli and timers are produced in user-event callbacks, not render output.

// Optional Stroop task. Results are task observations, never physical readiness
// or training clearance; the /brain archive imports the same component.
import { useEffect, useRef, useState } from "react";
import { Zap, Target } from "lucide-react";

const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_HEX: Record<string, string> = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308" };

export function CognitiveCheck({ lang = "en" }: { lang?: string }) {
  const es = lang === "es";
  const [word, setWord] = useState("");
  const [ink, setInk] = useState("");
  const [trial, setTrial] = useState(0);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveVersion = useRef(0);
  const startRef = useRef(0);

  const TOTAL = 10;

  function next() {
    let w = COLORS[Math.floor(Math.random() * COLORS.length)];
    let i = COLORS[Math.floor(Math.random() * COLORS.length)];
    if (w === i) { w = COLORS[(COLORS.indexOf(w) + 1) % COLORS.length]; } // avoid trivial same-word-same-color
    setWord(w); setInk(i);
    startRef.current = performance.now();
  }

  function begin() { saveVersion.current++; setSaveError(false); setStarted(true); setTrial(0); setTimes([]); setCorrect(0); setDone(false); setSaved(false); next(); }

  function answer(c: string) {
    const ms = performance.now() - startRef.current;
    const isCorrect = c === ink;
    if (isCorrect) setCorrect((n) => n + 1);
    setTimes((t) => [...t, ms]);
    const t = trial + 1;
    if (t >= TOTAL) {
      setDone(true);
      const avg = Math.round([...times, ms].reduce((a, x) => a + x, 0) / TOTAL);
      const accuracy = Math.round((correct + (isCorrect ? 1 : 0)) / TOTAL * 100);
      // Persist to the same cognitive history as the /brain tests.
      const version = saveVersion.current;
      fetch("/api/cognitive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: "stroop", score: avg, accuracy }), signal: AbortSignal.timeout(15000) })
        .then(async response => {
          const receipt = await response.json();
          if (!response.ok || receipt.ok !== true || typeof receipt.id !== "string" || !receipt.id) throw Error("Save unconfirmed");
          if (version === saveVersion.current) setSaved(true);
        })
        .catch(() => { if (version === saveVersion.current) setSaveError(true); });
    } else {
      setTrial(t);
      next();
    }
  }

  if (!started) {
    return (
      <div className="card text-center py-8">
        <Zap className="w-9 h-9 text-violet-500 mx-auto mb-3" />
        <h3 className="font-display font-bold text-lg">{es ? "Cognitive Check — Stroop" : "Cognitive Check — Stroop"}</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          {es
            ? "La palabra dice un color, la tinta es otra. Toca el color de la TINTA. 10 rondas. Es un resultado de la tarea, no una prueba de preparación física."
            : "The word says one color, the ink is another. Tap the INK color. 10 trials. This is a task result, not a physical readiness test."}
        </p>
        <button onClick={begin} className="btn-primary">{es ? "Empezar" : "Start"}</button>
      </div>
    );
  }

  if (done) {
    const avg = Math.round(times.reduce((a, x) => a + x, 0) / times.length);
    return (
      <div className="card text-center py-8">
        <Target className="w-9 h-9 text-emerald-500 mx-auto mb-3" />
        <h3 className="font-display font-bold text-lg">
          {es ? "¡Listo!" : "Done!"} {es ? "Promedio" : "Avg"} {avg} ms · {Math.round(correct / TOTAL * 100)}%
        </h3>
        <p className="text-sm text-slate-500 mt-2">
          {es ? "La práctica, el dispositivo y las distracciones pueden cambiar el resultado. No modifica tu entrenamiento." : "Practice, device and distractions can affect this result. It does not change your training."}
        </p>
        {saveError && <p role="alert" className="text-sm text-red-700">{es ? "No se confirmó el guardado. El resultado solo está en esta pantalla." : "Saving was not confirmed. This result is only on this screen."}</p>}
        {saved && <p className="text-xs text-emerald-600 mt-1">{es ? "✓ Guardado en tu historial cognitivo" : "✓ Saved to your cognitive history"}</p>}
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={begin} className="btn-secondary">{es ? "Repetir" : "Retest"}</button>
          <a href="/brain" className="btn-secondary">{es ? "Historial completo" : "Full history"}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="card text-center py-8">
      <div className="text-xs text-slate-400 mb-2">{es ? "Ronda" : "Trial"} {trial + 1}/{TOTAL} — {es ? "toca el color de la TINTA" : "tap the INK color"}</div>
      <div className="font-display text-5xl font-bold mb-6" style={{ color: COLOR_HEX[ink] }}>{word}</div>
      <div className="flex justify-center gap-3 flex-wrap">
        {COLORS.map((c) => (
          <button key={c} onClick={() => answer(c)} className="w-16 h-16 rounded-xl text-white font-bold text-sm" style={{ backgroundColor: COLOR_HEX[c] }}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
