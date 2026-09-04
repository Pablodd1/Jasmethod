"use client";

// TODAY — the athlete's first page after login. The prescribed training pops
// immediately (mobile-first), with Check In / Skip at the top and the full
// color-coded arc: pre-fuel → warm-up → main → cool-down → breathing →
// post-fuel. Device sync runs in the background; send-to-watch and Telegram
// are one tap each. After sending or saving → Calendar.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck, SkipForward, Send, Watch, Flame, Dumbbell, Waves, Bike, Zap,
  HeartPulse, Wind, UtensilsCrossed, RefreshCw, CalendarDays, Moon, Play, CloudSun,
} from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const SPORT_ICON: Record<string, any> = { swim: Waves, bike: Bike, run: Zap, strength: Dumbbell, brick: Zap, recovery: HeartPulse, hyrox: Flame, boxing: Zap, mobility: Wind };

export default function TodayPage() {
  const { user } = useAuth();
  const router = useRouter();
  const lang = (user?.language || "es") as string;
  const es = lang === "es";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [tgMsg, setTgMsg] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/today");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  // Background device sync: fire once on load (no blocking) — the prescription
  // re-renders from the freshest biometrics when it lands.
  useEffect(() => {
    if (!user || !data || syncing) return;
    if ((data.devices?.count || 0) === 0) return;
    setSyncing(true);
    fetch("/api/connectors/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        setSyncMsg(d.message || null);
        load();
      })
      .catch(() => {})
      .finally(() => setSyncing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data?.devices?.count]);

  async function approveAndSend() {
    setApproving(true);
    try {
      const res = await fetch("/api/workout/approve", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Approve failed");
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") || "";
      const name = dispo.match(/filename="([^"]+)"/)?.[1] || "workout.fit";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      // After send → Calendar (per product flow)
      setTimeout(() => router.push("/calendar"), 900);
    } catch { /* the approve button on checkin shows detailed errors */ } finally {
      setApproving(false);
    }
  }

  async function regenerate(mode: "variant" | "alternate") {
    if (!primary) return;
    setRegenBusy(true); setRegenMsg(null);
    try {
      const res = await fetch("/api/workout/regenerate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: primary.id, mode }),
      });
      const d = await res.json();
      if (!res.ok) { setRegenMsg(d.error || "Failed"); }
      else { setRegenMsg(es ? `✓ Nueva sesión (${d.regensLeft} restantes)` : `✓ New session (${d.regensLeft} left)`); load(); }
    } catch (e: any) { setRegenMsg(e.message); } finally { setRegenBusy(false); }
  }

  async function askJasai() {
    if (!askQ.trim()) return;
    setAskBusy(true); setAskA(null);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: askQ }) });
      const d = await res.json();
      setAskA(d.answer || d.error || "—");
    } catch (e: any) { setAskA(e.message); } finally { setAskBusy(false); }
  }

  async function sendTelegram() {
    setTgMsg("…");
    const res = await fetch("/api/reminders/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ when: "today" }) });
    const d = await res.json();
    const tg = d.result?.telegram;
    setTgMsg(tg?.ok ? (es ? "✓ Enviado a tu Telegram" : "✓ Sent to your Telegram") : (tg?.error || d.error || "Telegram error"));
  }

  if (loading) {
    return (
      <ProtectedPage>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedPage>
    );
  }

  const primary = data?.sessions?.[0];
  const SportIcon = primary ? (SPORT_ICON[primary.sport] || Zap) : CalendarDays;

  return (
    <ProtectedPage>
      <div className="space-y-5 max-w-3xl mx-auto md:max-w-none">
        {/* Header + race countdown */}
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">{new Date().toLocaleDateString(es ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="font-display text-3xl font-bold">{es ? "Entrenamiento de hoy" : "Today's Training"}</h1>
          {data?.race && (
            <p className="text-sm text-coral-600 font-medium mt-1">
              🏁 {data.race.name} — {es ? "en" : "in"} {data.race.daysAway} {es ? "días" : "days"}
            </p>
          )}
        </div>

        {/* Top actions: compact Check In | Skip — short labels, single line */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/checkin" className="btn-primary justify-center !py-2">
            <ClipboardCheck className="w-4 h-4" /> {es ? "Chequeo" : "Check In"}
          </Link>
          <Link href="/calendar" className="btn-secondary justify-center !py-2">
            <SkipForward className="w-4 h-4" /> {es ? "Saltar" : "Skip"}
          </Link>
        </div>

        {syncMsg && <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">🔄 {syncing ? (es ? "Sincronizando dispositivos…" : "Syncing devices…") : syncMsg}</div>}

        {/* Empty states */}
        {data?.dayOff && (
          <div className="card text-center py-10">
            <CloudSun className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold">{es ? "Día libre — 20 min Z1 + respiración" : "Day off — 20 min Z1 + breathing"}</p>
            <p className="text-sm text-slate-500 mt-1">{es ? "Un día libre NO es cero: mantiene el flujo y el hábito vivo." : "A day off is NOT zero — blood flow keeps the habit alive."}</p>
          </div>
        )}
        {!primary && !data?.dayOff && (
          <div className="card text-center py-12">
            <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-600">{es ? "No hay entrenamiento para hoy" : "No training for today"}</p>
            <p className="text-sm text-slate-400 mt-1">{es ? "Genera tu plan para ver aquí tu sesión de cada día." : "Generate your plan and your daily session appears here."}</p>
            <Link href="/training" className="btn-primary mt-4 inline-flex">{es ? "Generar plan" : "Generate plan"}</Link>
          </div>
        )}

        {/* THE session card */}
        {primary && !data.dayOff && (
          <div className="card !p-0 overflow-hidden">
            <div className={`p-5 text-white bg-gradient-to-br ${primary.sport === "swim" ? "from-sky-600 to-ocean-500" : primary.sport === "bike" ? "from-emerald-600 to-emerald-500" : primary.sport === "run" ? "from-coral-600 to-coral-500" : "from-ocean-700 to-ocean-600"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SportIcon className="w-8 h-8" />
                  <div>
                    <div className="font-display font-bold text-xl leading-tight">{primary.title}</div>
                    <div className="text-sm opacity-90">{primary.durationMin} min{primary.intensity ? ` · ${primary.intensity.toUpperCase()}` : ""}{data.targets?.power ? ` · ${data.targets.power}` : ""}</div>
                  </div>
                </div>
                {data.targets?.rpe && <div className="text-right text-xs opacity-90">RPE<br /><span className="font-display text-xl font-bold">{data.targets.rpe}</span>/10</div>}
              </div>
              {(data.targets?.hr || data.targets?.pace) && (
                <div className="mt-3 text-xs bg-white/15 rounded-lg px-2.5 py-1.5 inline-block">
                  {data.targets.hr && <>❤️ {data.targets.hr} </>}
                  {data.targets.pace && <>⚡ {data.targets.pace}</>}
                </div>
              )}
            </div>

            {/* Color-coded execution arc */}
            <div className="p-4 space-y-2.5">
              {data.ergos?.recommended?.length > 0 && (
                <Block color="bg-orange-50 border-orange-200" icon={<Flame className="w-4 h-4 text-orange-500" />} title={es ? "PRE — Ayudas ergogénicas (45-60 min antes)" : "PRE — Ergogenic aids (45-60 min before)"}>
                  {data.ergos.recommended.map((e: any) => (
                    <div key={e.key} className="text-xs text-slate-600">• <strong>{e.name}</strong> — {e.dose} ({e.evidence})</div>
                  ))}
                </Block>
              )}
              <Block color="bg-sky-50 border-sky-200" icon={<Play className="w-4 h-4 text-sky-600" />} title={es ? "CALENTAMIENTO" : "WARM-UP"}>
                <p className="text-sm text-slate-700">{data.detail?.wu}</p>
              </Block>
              <Block color="bg-violet-50 border-violet-200" icon={<SportIcon className="w-4 h-4 text-violet-600" />} title={es ? "SERIE PRINCIPAL" : "MAIN SET"}>
                <p className="text-sm text-slate-700">{data.detail?.main}</p>
                {data.fuel?.carbsPerHourG > 0 && (
                  <div className="mt-2 text-xs text-orange-700 bg-orange-50 rounded-lg px-2 py-1.5">
                    🍌 {es ? "Durante" : "During"}: {data.fuel.carbsPerHourG}g carbs/h · {data.fuel.sodiumMgPerHour}mg {es ? "sodio" : "sodium"}/h · {data.fuel.fluidMlPerHour}ml/h
                  </div>
                )}
              </Block>
              <Block color="bg-sky-50 border-sky-200" icon={<Wind className="w-4 h-4 text-sky-600" />} title={es ? "VUELTA A LA CALMA" : "COOL-DOWN"}>
                <p className="text-sm text-slate-700">{data.detail?.cd}</p>
              </Block>
              <Block color="bg-emerald-50 border-emerald-200" icon={<HeartPulse className="w-4 h-4 text-emerald-600" />} title={es ? "RESPIRACIÓN + SNS (recuperación)" : "BREATHING + ANS (recovery)"}>
                <p className="text-sm text-slate-700">{data.detail?.breathing}</p>
                <p className="text-xs text-slate-400 mt-1">{data.recovery?.name} · {data.recovery?.minutes} min</p>
              </Block>
              {data.post && (
                <Block color="bg-amber-50 border-amber-200" icon={<UtensilsCrossed className="w-4 h-4 text-amber-600" />} title={es ? "POST — Nutrición (30-60 min)" : "POST — Nutrition (30-60 min)"}>
                  <p className="text-sm text-slate-700"><strong>{data.post.carbsG}g carbs : {data.post.proteinG}g protein</strong> ({data.post.ratio})</p>
                  <p className="text-xs text-slate-500">{data.post.examples}</p>
                  <p className="text-xs text-slate-400">{data.post.sodiumMg}mg {es ? "sodio" : "sodium"} · {data.post.fluidMl}ml</p>
                </Block>
              )}
              <Block color="bg-indigo-50 border-indigo-200" icon={<Moon className="w-4 h-4 text-indigo-500" />} title={es ? "NOCHE — Desconexión" : "NIGHT — Wind-down"}>
                <p className="text-sm text-slate-700">{data.stim?.night?.brain}</p>
                <p className="text-xs text-slate-400">{data.stim?.night?.breath}</p>
              </Block>
            </div>

            {/* Actions: send to watch / telegram / save to calendar */}
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button onClick={approveAndSend} disabled={approving} className="btn-primary justify-center">
                <Watch className="w-4 h-4" /> {approving ? "…" : (es ? "Enviar al reloj (.FIT)" : "Send to watch (.FIT)")}
              </button>
              <button onClick={sendTelegram} className="btn-secondary justify-center">
                <Send className="w-4 h-4" /> {es ? "Enviar a Telegram" : "Send to Telegram"}
              </button>
              <Link href="/calendar" className="btn-secondary justify-center">
                <CalendarDays className="w-4 h-4" /> {es ? "Guardar → Calendario" : "Save → Calendar"}
              </Link>
            </div>
            {tgMsg && <div className="px-4 pb-4 text-xs text-slate-500">{tgMsg}</div>}
            {/* Regeneration: same goal, new session — up to 3 times */}
            <div className="px-4 pb-4 border-t border-sand-100 pt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 mr-1">{es ? "¿No te gusta esta sesión?" : "Don't like this session?"}</span>
              <button onClick={() => regenerate("variant")} disabled={regenBusy} className="btn-secondary !py-1.5 text-xs">
                🔄 {es ? "Variante" : "Variant"}
              </button>
              <button onClick={() => regenerate("alternate")} disabled={regenBusy} className="btn-secondary !py-1.5 text-xs">
                🔀 {es ? "Otro deporte (mismo objetivo)" : "Alternate sport (same goal)"}
              </button>
              {primary.regenCount > 0 && <span className="text-[10px] text-slate-400">{es ? "regeneraciones usadas" : "regens used"}: {primary.regenCount}/3</span>}
              {regenMsg && <span className="text-[11px] text-slate-500 w-full">{regenMsg}</span>}
            </div>
            {data.devices?.count > 0 && (
              <div className="px-4 pb-4 flex items-center gap-2 text-[11px] text-slate-400">
                <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                {es ? "Dispositivos sincronizados en segundo plano" : "Devices synced in the background"}{data.devices.lastSyncAt ? ` · ${new Date(data.devices.lastSyncAt).toLocaleTimeString(es ? "es-ES" : "en-US", { hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
            )}
          </div>
        )}

        {/* JASAI assistant — ask anything: the app, sports science, nutrition */}
        <div className="card">
          <div className="font-display font-bold mb-2">🤖 {es ? "Pregunta a JASAI" : "Ask JASAI"}</div>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={askQ}
              onChange={(e) => setAskQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") askJasai(); }}
              placeholder={es ? "¿Cómo uso mis zonas? ¿Qué comer antes de competir? ¿Cómo conecto mi reloj?" : "How do I use my zones? What to eat pre-race? How do I connect my watch?"}
            />
            <button onClick={askJasai} disabled={askBusy} className="btn-primary shrink-0">{askBusy ? "…" : (es ? "Preguntar" : "Ask")}</button>
          </div>
          {askA && <div className="mt-3 text-sm text-slate-700 bg-ocean-50 border border-ocean-200 rounded-xl p-3 leading-relaxed">{askA}</div>}
        </div>

        {/* Navigation onward */}
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/checkin" className="chip chip-z2">✅ {es ? "Check-in" : "Check-in"}</Link>
          <Link href="/calendar" className="chip chip-z2">📅 {es ? "Calendario" : "Calendar"}</Link>
          <Link href="/dashboard" className="chip chip-z2">{es ? "Panel" : "Dashboard"}</Link>
          <Link href="/connectors" className="chip chip-z2">⌚ {es ? "Dispositivos" : "Devices"}</Link>
        </div>
      </div>
    </ProtectedPage>
  );
}

function Block({ color, icon, title, children }: { color: string; icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</span>
      </div>
      {children}
    </div>
  );
}
