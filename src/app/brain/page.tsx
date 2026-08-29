"use client";

import { useEffect, useRef, useState } from "react";
import { Brain, Zap, Timer, Target, History, Fingerprint, Scale, HeartPulse } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

// Cognitive training — the "brain" pillar. Interactive Stroop + Reaction Time
// tests run in-browser; scores persist and the coach uses them as a readiness/
// focus signal (paired with the stimulation plans in the check-in).
// Morning Check = no-device nervous-system tests (tapping, balance, manual HR).

const COLORS = ["red", "blue", "green", "yellow"];
const COLOR_HEX: Record<string, string> = { red: "#ef4444", blue: "#3b82f6", green: "#22c55e", yellow: "#eab308" };

export default function BrainPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"stroop" | "reaction" | "morning" | "history">("stroop");
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
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Brain className="w-6 h-6 text-violet-500" /> Cognitive & Nervous System</h1>
          <p className="text-slate-500 text-sm mt-1">Sharp mind, sharp performance. Quick tests — your scores feed the coach&apos;s readiness picture. No devices needed.</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab("stroop")} className={`chip ${tab === "stroop" ? "chip-z3" : ""}`}>Stroop Test</button>
          <button onClick={() => setTab("reaction")} className={`chip ${tab === "reaction" ? "chip-z3" : ""}`}>Reaction Time</button>
          <button onClick={() => setTab("morning")} className={`chip ${tab === "morning" ? "chip-z3" : ""}`}>Morning Check</button>
          <button onClick={() => setTab("history")} className={`chip ${tab === "history" ? "chip-z3" : ""}`}>History</button>
        </div>

        {tab === "stroop" && <StroopTest onSave={(s, a) => save("stroop", s, a)} />}
        {tab === "reaction" && <ReactionTest onSave={(s, a) => save("reaction", s, a)} />}
        {tab === "morning" && <MorningCheck onSave={save} />}
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

// ---------- MORNING CHECK (no-device nervous system tests) ----------
// Three quick tests anyone can do without a watch/sensor:
// 1. Finger tapping — motor speed / CNS fatigue (standard neuro assessment)
// 2. Balance — vestibular + proprioception (eyes-closed single-leg)
// 3. Manual pulse — 15s count → HR without a device (recovery signal)
function MorningCheck({ onSave }: { onSave: (test: string, score: number, accuracy: number | null, notes?: string) => void }) {
  const [sub, setSub] = useState<"tapping" | "balance" | "pulse" | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <button onClick={() => setSub("tapping")} className={`card text-center !p-5 hover:shadow-md transition-shadow ${sub === "tapping" ? "border-violet-400 bg-violet-50" : ""}`}>
          <Fingerprint className="w-8 h-8 text-violet-500 mx-auto mb-2" />
          <div className="font-semibold">Finger Tapping</div>
          <div className="text-xs text-slate-500 mt-1">Tap as fast as you can for 10s. Motor speed = nervous-system freshness.</div>
        </button>
        <button onClick={() => setSub("balance")} className={`card text-center !p-5 hover:shadow-md transition-shadow ${sub === "balance" ? "border-violet-400 bg-violet-50" : ""}`}>
          <Scale className="w-8 h-8 text-violet-500 mx-auto mb-2" />
          <div className="font-semibold">Balance (eyes closed)</div>
          <div className="text-xs text-slate-500 mt-1">Stand one leg, eyes closed. Time it. Proprioception + vestibular signal.</div>
        </button>
        <button onClick={() => setSub("pulse")} className={`card text-center !p-5 hover:shadow-md transition-shadow ${sub === "pulse" ? "border-violet-400 bg-violet-50" : ""}`}>
          <HeartPulse className="w-8 h-8 text-violet-500 mx-auto mb-2" />
          <div className="font-semibold">Manual Pulse</div>
          <div className="text-xs text-slate-500 mt-1">Count heartbeats 15s, multiply ×4. Resting HR without a device.</div>
        </button>
      </div>

      {sub === "tapping" && <TappingTest onSave={(s) => onSave("tapping", s, null)} />}
      {sub === "balance" && <BalanceTest onSave={(s) => onSave("balance", s, null)} />}
      {sub === "pulse" && <PulseTest onSave={(s) => onSave("pulse", s, null)} />}
    </div>
  );
}

function TappingTest({ onSave }: { onSave: (score: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const [count, setCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    setCount(0); setTimeLeft(10); setPhase("run");
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("done");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  if (phase === "done") {
    return (
      <div className="card text-center py-8">
        <Fingerprint className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <div className="font-display text-2xl font-bold">{count} taps in 10s</div>
        <p className="text-sm text-slate-500 mt-1">{count >= 60 ? "Fresh nervous system — motor speed excellent." : count >= 45 ? "Good baseline — track the trend." : "Slower today — could be CNS fatigue or just a slow start. Compare to your baseline."}</p>
        <div className="flex justify-center gap-2 mt-3"><button onClick={start} className="btn-secondary">Retest</button></div>
      </div>
    );
  }

  return (
    <div className="card text-center py-8">
      <div className="text-sm text-slate-500 mb-2">{phase === "run" ? `${timeLeft}s left — tap the button as fast as possible` : "Tap the button as fast as you can for 10 seconds. One hand, same finger."}</div>
      <button
        onClick={() => setCount((c) => c + 1)}
        disabled={phase === "idle"}
        className={`w-40 h-40 rounded-3xl font-display text-4xl font-bold transition-colors ${phase === "run" ? "bg-violet-600 text-white active:scale-95" : "bg-violet-100 text-violet-400"}`}
      >
        {phase === "run" ? `${count}` : "Start"}
      </button>
      {phase === "idle" && <div className="mt-3"><button onClick={start} className="btn-primary">Begin 10s</button></div>}
    </div>
  );
}

function BalanceTest({ onSave }: { onSave: (score: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    setElapsed(0); setPhase("run");
    const t0 = performance.now();
    intervalRef.current = setInterval(() => setElapsed(Math.round((performance.now() - t0) / 1000)), 100);
  }
  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("done");
    onSave(Math.max(elapsed, 1));
  }
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  if (phase === "done") {
    return (
      <div className="card text-center py-8">
        <Scale className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <div className="font-display text-2xl font-bold">{elapsed}s eyes-closed single-leg</div>
        <p className="text-sm text-slate-500 mt-1">{elapsed >= 30 ? "Excellent proprioception." : elapsed >= 15 ? "Good baseline — track it." : "Under 15s — normal variability, but a dropping trend signals fatigue."}</p>
        <div className="flex justify-center gap-2 mt-3"><button onClick={start} className="btn-secondary">Retest</button></div>
      </div>
    );
  }

  return (
    <div className="card text-center py-8">
      <div className="text-sm text-slate-500 mb-3">{phase === "run" ? `Standing… ${elapsed}s — tap STOP the moment you touch down.` : "Stand on one leg, close your eyes. Tap STOP when you lose balance. Do it near a wall!"}</div>
      {phase === "run" ? (
        <button onClick={stop} className="w-40 h-40 rounded-3xl bg-emerald-600 text-white font-display text-3xl font-bold">STOP</button>
      ) : (
        <button onClick={start} className="btn-primary">Begin</button>
      )}
    </div>
  );
}

function PulseTest({ onSave }: { onSave: (score: number) => void }) {
  const [count15, setCount15] = useState("");
  const [phase, setPhase] = useState<"idle" | "counting" | "done">("idle");
  const [timeLeft, setTimeLeft] = useState(15);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function start() {
    setTimeLeft(15); setPhase("counting");
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPhase("done");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function submit() {
    const beats = parseInt(count15, 10);
    if (!beats || beats < 8 || beats > 40) return;
    const bpm = beats * 4;
    onSave(bpm);
    setPhase("done");
  }

  if (phase === "done") {
    const bpm = parseInt(count15, 10) * 4;
    return (
      <div className="card text-center py-8">
        <HeartPulse className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <div className="font-display text-2xl font-bold">{bpm} bpm resting</div>
        <p className="text-sm text-slate-500 mt-1">{bpm < 50 ? "Low resting HR — strong fitness base." : bpm <= 65 ? "Great recovery zone." : bpm <= 80 ? "Normal. A rising trend over days = under-recovery." : "Elevated — take the easy option today."}</p>
        <div className="flex justify-center gap-2 mt-3"><button onClick={() => { setPhase("idle"); setCount15(""); }} className="btn-secondary">Retest</button></div>
      </div>
    );
  }

  return (
    <div className="card text-center py-8">
      <div className="text-sm text-slate-500 mb-3">
        {phase === "counting"
          ? `Count your heartbeat now… ${timeLeft}s`
          : "Find your pulse (wrist or neck). Start the timer, count beats for 15 seconds, enter the number."}
      </div>
      {phase === "counting" ? (
        <div className="font-display text-4xl font-bold text-violet-600 mb-3">{timeLeft}</div>
      ) : null}
      {phase === "idle" && <button onClick={start} className="btn-primary mb-3">Start 15s timer</button>}
      {phase !== "idle" && (
        <div className="flex justify-center items-center gap-2 max-w-xs mx-auto">
          <input type="number" min={8} max={40} value={count15} onChange={(e) => setCount15(e.target.value)} placeholder="Beats in 15s" className="input text-center" />
          <button onClick={submit} className="btn-secondary shrink-0">Save (×4)</button>
        </div>
      )}
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
              <div className="text-xs text-slate-400 uppercase tracking-wide capitalize">{k === "tapping" ? "Tapping" : k === "balance" ? "Balance" : k === "pulse" ? "Resting HR" : k}</div>
              <div className="font-display text-2xl font-bold mt-1">{v.best}{k === "stroop" || k === "reaction" ? " ms" : k === "tapping" ? " taps" : k === "balance" ? " s" : k === "pulse" ? " bpm" : ""}</div>
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
                  <td className="py-2 pr-3 font-semibold">{t.score}{t.test === "stroop" || t.test === "reaction" ? " ms" : t.test === "tapping" ? " taps" : t.test === "balance" ? " s" : t.test === "pulse" ? " bpm" : ""}</td>
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
