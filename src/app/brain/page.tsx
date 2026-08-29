"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Zap, Timer, Target, History } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

// Cognitive training — the "brain" pillar. Interactive Stroop + Reaction Time
// tests run in-browser; scores persist and the coach uses them as a readiness/
// focus signal (paired with the stimulation plans in the check-in).

const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_HEX: Record<string, string> = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308" };

export default function BrainPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"stroop" | "reaction" | "history">("stroop");
  const [history, setHistory] = useState<any[]>([]);
  const [best, setBest] = useState<any>({});

  async function loadHistory() {
    const res = await fetch("/api/cognitive");
    const d = await res.json();
    setHistory(d.tests || []);
    setBest(d.best || {});
  }
  useEffect(() => { if (user) loadHistory(); }, [user]);

  async function save(test: string, score: number, accuracy: number | null, notes?: string) {
    await fetch("/api/cognitive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test, score, accuracy, notes }) });
    loadHistory();
  }

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Brain className="w-6 h-6 text-violet-500" /> Cognitive Training</h1>
          <p className="text-slate-500 text-sm mt-1">Sharp mind, sharp performance. Quick tests — your scores feed the coach&apos;s readiness picture.</p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab("stroop")} className={`chip ${tab === "stroop" ? "chip-z3" : ""}`}>Stroop Test</button>
          <button onClick={() => setTab("reaction")} className={`chip ${tab === "reaction" ? "chip-z3" : ""}`}>Reaction Time</button>
          <button onClick={() => setTab("history")} className={`chip ${tab === "history" ? "chip-z3" : ""}`}>History</button>
        </div>

        {tab === "stroop" && <StroopTest onSave={(s, a) => save("stroop", s, a)} />}
        {tab === "reaction" && <ReactionTest onSave={(s, a) => save("reaction", s, a)} />}
        {tab === "history" && <HistoryView history={history} best={best} />}
      </div>
    </ProtectedPage>
  );
}

// ---------- STROOP ----------
function StroopTest({ onSave }: { onSave: (score: number, accuracy: number) => void }) {
  const [word, setWord] = useState("");
  const [ink, setInk] = useState("");
  const [trial, setTrial] = useState(0);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [times, setTimes] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const startRef = useRef(0);

  const TOTAL = 10;

  function next() {
    let w = COLORS[Math.floor(Math.random() * COLORS.length)];
    let i = COLORS[Math.floor(Math.random() * COLORS.length)];
    if (w === i) { w = COLORS[(COLORS.indexOf(w) + 1) % COLORS.length]; } // avoid trivial same-word-same-color
    setWord(w); setInk(i);
    startRef.current = performance.now();
  }

  function begin() { setStarted(true); setTrial(0); setTimes([]); setCorrect(0); setDone(false); next(); }

  function answer(c: string) {
    const ms = performance.now() - startRef.current;
    const isCorrect = c === ink;
    if (isCorrect) setCorrect((n) => n + 1);
    setTimes((t) => [...t, ms]);
    const t = trial + 1;
    if (t >= TOTAL) {
      setDone(true);
      const avg = [...times, ms].reduce((a, x) => a + x, 0) / TOTAL;
      onSave(Math.round(avg), Math.round((correct + (isCorrect ? 1 : 0)) / TOTAL * 100));
    } else {
      setTrial(t);
      next();
    }
  }

  if (!started) {
    return (
      <div className="card text-center py-10">
        <Zap className="w-10 h-10 text-violet-500 mx-auto mb-3" />
        <h3 className="font-display font-bold text-lg">Stroop Test</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">The word says one color, the ink is another. Tap the INK color. 10 trials — measures inhibitory control (relevant to pacing discipline).</p>
        <button onClick={begin} className="btn-primary">Start</button>
      </div>
    );
  }

  if (done) {
    const avg = Math.round(times.reduce((a, x) => a + x, 0) / times.length);
    return (
      <div className="card text-center py-10">
        <Target className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="font-display font-bold text-lg">Done! Avg {avg} ms · {Math.round(correct / TOTAL * 100)}% accurate</h3>
        <p className="text-sm text-slate-500 mt-2">{avg < 700 ? "Elite focus — top-tier inhibitory control." : avg < 1000 ? "Solid — above average focus." : "Reasonable baseline — retest weekly, expect improvement."}</p>
        <div className="flex justify-center gap-2 mt-4"><button onClick={begin} className="btn-secondary">Retest</button></div>
      </div>
    );
  }

  return (
    <div className="card text-center py-10">
      <div className="text-xs text-slate-400 mb-2">Trial {trial + 1}/{TOTAL} — tap the INK color</div>
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

// ---------- REACTION TIME ----------
function ReactionTest({ onSave }: { onSave: (score: number, accuracy: number | null) => void }) {
  const [phase, setPhase] = useState<"idle" | "waiting" | "go" | "done">("idle");
  const [times, setTimes] = useState<number[]>([]);
  const [msg, setMsg] = useState("");
  const waitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goRef = useRef(0);
  const TOTAL = 5;

  function begin() {
    setTimes([]); setPhase("waiting"); setMsg("Wait for green…");
    waitRef.current = setTimeout(() => {
      setPhase("go"); setMsg("TAP!"); goRef.current = performance.now();
    }, 1000 + Math.random() * 3000);
  }

  function tap() {
    if (phase === "waiting") { // false start
      setMsg("Too early! Wait for green…"); return;
    }
    if (phase !== "go") return;
    const ms = performance.now() - goRef.current;
    const t = [...times, ms];
    setTimes(t);
    if (t.length >= TOTAL) {
      setPhase("done");
      const avg = t.reduce((a, x) => a + x, 0) / t.length;
      onSave(Math.round(avg), null);
    } else {
      setPhase("waiting"); setMsg("Wait for green…");
      waitRef.current = setTimeout(() => {
        setPhase("go"); setMsg("TAP!"); goRef.current = performance.now();
      }, 1000 + Math.random() * 3000);
    }
  }

  useEffect(() => () => { if (waitRef.current) clearTimeout(waitRef.current); }, []);

  if (phase === "idle" || phase === "done") {
    const avg = phase === "done" ? Math.round(times.reduce((a, x) => a + x, 0) / times.length) : 0;
    return (
      <div className="card text-center py-10">
        <Timer className="w-10 h-10 text-violet-500 mx-auto mb-3" />
        <h3 className="font-display font-bold text-lg">Reaction Time</h3>
        {phase === "done" && <p className="text-sm text-slate-600 mt-2">Avg {avg} ms {avg < 250 ? "— elite." : avg < 300 ? "— above average." : "— retest weekly."}</p>}
        <p className="text-sm text-slate-500 mt-1 mb-4">Tap the moment it turns green. 5 trials. Raw reaction speed matters for starts, surges, and safety.</p>
        <button onClick={begin} className="btn-primary">{phase === "done" ? "Retest" : "Start"}</button>
      </div>
    );
  }

  return (
    <div className={`card text-center py-20 cursor-pointer select-none ${phase === "go" ? "bg-emerald-50" : "bg-slate-50"}`} onClick={tap}>
      <div className={`font-display text-2xl font-bold ${phase === "go" ? "text-emerald-600" : "text-slate-400"}`}>{msg}</div>
    </div>
  );
}

// ---------- HISTORY ----------
function HistoryView({ history, best }: { history: any[]; best: any }) {
  return (
    <div className="space-y-4">
      {Object.keys(best).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(best).map(([k, v]: any) => (
            <div key={k} className="card !p-4 text-center">
              <div className="text-xs text-slate-400 uppercase tracking-wide capitalize">{k}</div>
              <div className="font-display text-2xl font-bold mt-1">{v.best}{k === "stroop" || k === "reaction" ? " ms" : ""}</div>
              <div className="text-xs text-slate-400">best · avg {v.avg} · {v.n} tests</div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h3 className="font-display font-bold mb-2 flex items-center gap-2"><History className="w-4 h-4 text-violet-500" /> Recent results</h3>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No tests yet. Run a Stroop or Reaction test above — the coach uses these as a focus signal.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400 uppercase border-b border-sand-200">
              <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Test</th><th className="py-2 pr-3">Score</th><th className="py-2 pr-3">Accuracy</th>
            </tr></thead>
            <tbody>
              {history.map((t: any) => (
                <tr key={t.id} className="border-b border-sand-100">
                  <td className="py-2 pr-3">{new Date(t.date).toLocaleDateString()} {new Date(t.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2 pr-3 capitalize">{t.test}</td>
                  <td className="py-2 pr-3 font-semibold">{t.score}{t.test === "stroop" || t.test === "reaction" ? " ms" : ""}</td>
                  <td className="py-2 pr-3">{t.accuracy != null ? `${t.accuracy}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
