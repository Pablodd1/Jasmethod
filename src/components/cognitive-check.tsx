"use client";
/* eslint-disable react-hooks/purity -- Math.random()/performance.now() are the Stroop stimulus itself, invoked from user events, not render output */

// Cognitive check — compact Stroop test (inhibitory control, the pacing-
// discipline system). Consolidated INTO the Daily Check-in per the product
// spec; the /brain archive page imports this same component.
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
  const startRef = useRef(0);

  const TOTAL = 10;

  function next() {
    let w = COLORS[Math.floor(Math.random() * COLORS.length)];
    let i = COLORS[Math.floor(Math.random() * COLORS.length)];
    if (w === i) { w = COLORS[(COLORS.indexOf(w) + 1) % COLORS.length]; } // avoid trivial same-word-same-color
    setWord(w); setInk(i);
    startRef.current = performance.now();
  }

  function begin() { setStarted(true); setTrial(0); setTimes([]); setCorrect(0); setDone(false); setSaved(false); next(); }

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
      fetch("/api/cognitive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: "stroop", score: avg, accuracy }) })
        .then(() => setSaved(true))
        .catch(() => {});
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
            ? "La palabra dice un color, la tinta es otra. Toca el color de la TINTA. 10 rondas — mide el control inhibitorio (disciplina de ritmo)."
            : "The word says one color, the ink is another. Tap the INK color. 10 trials — measures inhibitory control (relevant to pacing discipline)."}
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
          {avg < 700 ? (es ? "Enfoque de élite — control inhibitorio de primer nivel." : "Elite focus — top-tier inhibitory control.")
            : avg < 1000 ? (es ? "Sólido — enfoque sobre el promedio." : "Solid — above average focus.")
            : (es ? "Base razonable — repite cada semana y verás mejora." : "Reasonable baseline — retest weekly, expect improvement.")}
        </p>
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
