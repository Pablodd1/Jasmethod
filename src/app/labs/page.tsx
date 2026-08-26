"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Beaker, Droplets, HeartPulse, Bike, Waves, Footprints, Save, Zap } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { buildZoneTable } from "@/lib/science";
import { t, type Lang } from "@/lib/i18n";

// ---------- pure calculator math (ported from the Miami prototype, reused here) ----------
function parseHMS(t: string) {
  const p = t.split(":").map(Number);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return Number(p[0]) || 0;
}
function vo2At(v: number) { return -4.6 + 0.182258 * v + 0.000104 * v * v; }
function vFromVO2(o: number) { const a = 0.000104, b = 0.182258; return (-b + Math.sqrt(b * b + 4 * a * (o + 4.6))) / (2 * a); }
function fmtPK(sk: number) { const s = Math.round(sk); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

// VDOT (Daniels) from a race time + distance
function vdot(sec: number, dist: number) {
  const v = dist / (sec / 60); // m/min
  const util: Record<number, number> = { 5000: 0.94, 10000: 0.955, 21097: 0.92, 42195: 0.87 };
  const u = util[dist] ?? 0.9;
  return vo2At(v) / u;
}
// CSS (swim critical speed) from 400m + 200m times
function css(t4: number, t2: number) { return 200 / (t4 - t2); } // sec/100m

export default function LabsPage() {
  const { user } = useAuth();
  const lang = (user?.language || "en") as Lang;
  const [vd, setVd] = useState<any>(null);
  const [ftp, setFtp] = useState<any>(null);
  const [lthr, setLthr] = useState<any>(null);
  const [cssRes, setCss] = useState<any>(null);
  const [fuel, setFuel] = useState<any>(null);
  const [sweat, setSweat] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [savedMsg, setSavedMsg] = useState<string>("");

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((d) => setProfile(d.profile));
  }, []);

  function saveZones(payload: Record<string, any>) {
    setSavedMsg("");
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json()).then((d) => {
      if (d.ok) setSavedMsg("Saved to your profile — zones updated across the app.");
      else setSavedMsg("Could not save: " + (d.error || "unknown"));
      setTimeout(() => setSavedMsg(""), 4000);
    });
  }

  // live zone table from current inputs
  const zones = profile?.lthr
    ? buildZoneTable({ lthr: profile.lthr, ftp: profile.ftp || undefined, thresholdPaceSecPer100m: profile.swimPaceBase || undefined, thresholdPaceSecPerKm: profile.runPaceBase || undefined })
    : null;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">{t(lang, "labs.title")}</h1>
          <p className="text-slate-500 mt-1">Run the tests, get real zones, push them into your plan. Re-test every 6–8 weeks. <span className="text-coral-600 font-medium">{t(lang, "labs.subtitle")}</span></p>
        </div>

        {savedMsg && <div className="card border-emerald-200 bg-emerald-50 text-emerald-800 font-medium">{savedMsg}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          {/* VDOT */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><Footprints className="w-5 h-5 text-ocean-600" /><h2 className="font-display font-bold text-lg">{t(lang, "labs.vdot")}</h2></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="col-span-1">{t(lang, "labs.raceDistance")}
                <select id="vdDist" className="inp" defaultValue="5000">
                  <option value="5000">5K</option><option value="10000">10K</option>
                  <option value="21097">Half</option><option value="42195">Marathon</option>
                </select>
              </label>
              <label className="col-span-1">Time (mm:ss or h:mm:ss)
                <input id="vdTime" className="inp" placeholder="21:30" />
              </label>
            </div>
            <button className="btn" onClick={() => {
              const sec = parseHMS((document.getElementById("vdTime") as HTMLInputElement).value);
              const dist = +(document.getElementById("vdDist") as HTMLSelectElement).value;
              if (!sec) return;
              const vd = vdot(sec, dist);
              const pv = (f: number) => fmtPK(1000 / vFromVO2(vd * f) * 60) + " /km";
              setVd({ vdot: vd.toFixed(1), easy: pv(0.72), threshold: pv(0.88), interval: pv(0.98) });
            }}>{t(lang, "labs.calcPaces")}</button>
            {vd && <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[["VDOT", vd.vdot], ["EASY", vd.easy], ["THR", vd.threshold], ["INT", vd.interval]].map((x) => (
                <div key={x[0]} className="rounded-xl bg-ocean-50 p-2"><div className="text-[10px] uppercase text-slate-400">{x[0]}</div><div className="font-display font-bold text-ocean-700">{x[1]}</div></div>
              ))}
            </div>}
          </div>

          {/* FTP */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><Bike className="w-5 h-5 text-ocean-600" /><h2 className="font-display font-bold text-lg">{t(lang, "labs.ftp")}</h2></div>
            <label className="text-sm">{t(lang, "labs.ftpTest")}
              <input id="ftpW" className="inp" placeholder="250" />
            </label>
            <button className="btn" onClick={() => {
              const raw = +(document.getElementById("ftpW") as HTMLInputElement).value;
              if (!raw) return;
              const ftpW = Math.round(raw * 0.95);
              const f = [0.54, 0.75, 0.9, 0.975, 1.13, 1.35];
              setFtp({ ftpW, zones: f.map((z) => Math.round(ftpW * z)) });
            }}>{t(lang, "labs.buildZones")}</button>
            {ftp && <>
              <div className="mt-2 text-center font-display text-2xl font-bold text-ocean-700">{ftp.ftpW} W</div>
              <div className="grid grid-cols-3 gap-1 mt-2 text-center text-xs">
                {["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"].map((z, i) => (
                  <div key={z} className="rounded bg-sand-100 p-1"><div className="text-slate-400">{z}</div><div className="font-semibold">{ftp.zones[i]}</div></div>
                ))}
              </div>
              <button className="btn ghost mt-2 w-full" onClick={() => saveZones({ ftp: ftp.ftpW })}><Save className="w-4 h-4" /> {t(lang, "labs.saveFtp")}</button>
            </>}
          </div>

          {/* LTHR */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><HeartPulse className="w-5 h-5 text-coral-600" /><h2 className="font-display font-bold text-lg">{t(lang, "labs.lthr")}</h2></div>
            <label className="text-sm">{t(lang, "labs.lthrTest")}
              <input id="lthr" className="inp" placeholder="162" />
            </label>
            <button className="btn" onClick={() => {
              const v = +(document.getElementById("lthr") as HTMLInputElement).value;
              if (!v) return;
              const f = [0.84, 0.87, 0.92, 0.97, 1.02];
              setLthr({ v, zones: f.map((z) => Math.round(v * z)) });
            }}>{t(lang, "labs.buildZones")}</button>
            {lthr && <>
              <div className="mt-2 text-center font-display text-2xl font-bold text-coral-600">{lthr.v} bpm</div>
              <div className="grid grid-cols-5 gap-1 mt-2 text-center text-xs">
                {["Z1", "Z2", "Z3", "Z4", "Z5"].map((z, i) => (
                  <div key={z} className="rounded bg-sand-100 p-1"><div className="text-slate-400">{z}</div><div className="font-semibold">{lthr.zones[i]}</div></div>
                ))}
              </div>
              <button className="btn ghost mt-2 w-full" onClick={() => saveZones({ lthr: lthr.v })}><Save className="w-4 h-4" /> {t(lang, "labs.saveLthr")}</button>
            </>}
          </div>

          {/* CSS */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><Waves className="w-5 h-5 text-ocean-600" /><h2 className="font-display font-bold text-lg">{t(lang, "labs.css")}</h2></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>{t(lang, "labs.css400")}<input id="s400" className="inp" placeholder="6:00" /></label>
              <label>{t(lang, "labs.css200")}<input id="s200" className="inp" placeholder="2:50" /></label>
            </div>
            <button className="btn" onClick={() => {
              const t4 = parseHMS((document.getElementById("s400") as HTMLInputElement).value);
              const t2 = parseHMS((document.getElementById("s200") as HTMLInputElement).value);
              if (!t4 || !t2) return;
              const p100 = 100 / css(t4, t2);
              setCss({ css: fmtPK(p100) + "/100", en2: fmtPK(p100 / 0.92) + "/100", en3: fmtPK(p100 / 0.985) + "/100" });
            }}>{t(lang, "labs.calcCss")}</button>
            {cssRes && <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[["CSS", cssRes.css], ["EN2", cssRes.en2], ["EN3", cssRes.en3]].map((x) => (
                <div key={x[0]} className="rounded-xl bg-ocean-50 p-2"><div className="text-[10px] uppercase text-slate-400">{x[0]}</div><div className="font-display font-bold text-ocean-700">{x[1]}</div></div>
              ))}
            </div>}
          </div>

          {/* Fuel */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><Beaker className="w-5 h-5 text-ocean-600" /><h2 className="font-display font-bold text-lg">{t(lang, "labs.fuel")}</h2></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>{t(lang, "labs.bodyWeight")}<input id="fW" className="inp" placeholder="70" /></label>
              <label>Training min today<input id="fMin" className="inp" placeholder="90" /></label>
            </div>
            <button className="btn" onClick={() => {
              const w = +(document.getElementById("fW") as HTMLInputElement).value;
              const min = +(document.getElementById("fMin") as HTMLInputElement).value;
              if (!w || !min) return;
              const tdee = Math.round(w * 24 * 1.35 + min * 8.2);
              const carb = Math.round(w * (min < 60 ? 5 : min < 120 ? 7 : 9));
              const prot = Math.round(w * 1.9);
              const fat = Math.round((tdee - carb * 4 - prot * 4) / 9);
              setFuel({ tdee, carb, prot, fat });
            }}>Calc fuel</button>
            {fuel && <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[["KCAL", fuel.tdee], ["CARB", fuel.carb + "g"], ["PRO", fuel.prot + "g"], ["FAT", fuel.fat + "g"]].map((x) => (
                <div key={x[0]} className="rounded-xl bg-ocean-50 p-2"><div className="text-[10px] uppercase text-slate-400">{x[0]}</div><div className="font-display font-bold text-ocean-700">{x[1]}</div></div>
              ))}
            </div>}
          </div>

          {/* Sweat */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><Droplets className="w-5 h-5 text-ocean-600" /><h2 className="font-display font-bold text-lg">Sweat Rate</h2></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>Weight before (kg)<input id="hPre" className="inp" placeholder="70.0" /></label>
              <label>Weight after (kg)<input id="hPost" className="inp" placeholder="69.2" /></label>
              <label>Fluid drank (ml)<input id="hIn" className="inp" placeholder="500" /></label>
              <label>Session duration (min)<input id="hDur" className="inp" placeholder="90" /></label>
            </div>
            <button className="btn" onClick={() => {
              const pre = +(document.getElementById("hPre") as HTMLInputElement).value;
              const post = +(document.getElementById("hPost") as HTMLInputElement).value;
              const inMl = +(document.getElementById("hIn") as HTMLInputElement).value;
              const dur = +(document.getElementById("hDur") as HTMLInputElement).value;
              if (!pre || !post || !dur) return;
              const rate = Math.round(((pre - post) * 1000 + inMl) / dur * 60);
              setSweat({ rate, target: Math.round(rate * 0.8), sodium: rate > 1200 ? "700–900" : "500–700" });
            }}>Calc sweat</button>
            {sweat && <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[["RATE", sweat.rate + " ml/h"], ["TARGET", sweat.target + " ml/h"], ["SODIUM", sweat.sodium + " mg/L"]].map((x) => (
                <div key={x[0]} className="rounded-xl bg-ocean-50 p-2"><div className="text-[10px] uppercase text-slate-400">{x[0]}</div><div className="font-display font-bold text-ocean-700">{x[1]}</div></div>
              ))}
            </div>}
          </div>
        </div>

        {/* Your saved zones */}
        {zones && (
          <div className="card">
            <div className="flex items-center gap-2 mb-3"><Zap className="w-5 h-5 text-coral-600" /><h2 className="font-display font-bold text-lg">Your Saved Zones (live)</h2></div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs uppercase text-slate-400 font-semibold mb-1">Heart Rate (bpm)</div>
                <div className="space-y-1 text-sm">
                  {zones.hr && Object.entries(zones.hr).map(([k, v]: any) => (
                    <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-semibold">{v.low}–{v.high}</span></div>
                  ))}
                </div>
              </div>
              {zones.power && <div>
                <div className="text-xs uppercase text-slate-400 font-semibold mb-1">Power (W)</div>
                <div className="space-y-1 text-sm">
                  {Object.entries(zones.power).map(([k, v]: any) => (
                    <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-semibold">{v.low}–{v.high}</span></div>
                  ))}
                </div>
              </div>}
              {zones.pace && <div>
                <div className="text-xs uppercase text-slate-400 font-semibold mb-1">Pace (sec/100m · km)</div>
                <div className="space-y-1 text-sm">
                  {Object.entries(zones.pace).map(([k, v]: any) => (
                    <div key={k} className="flex justify-between"><span className="capitalize">{k}</span><span className="font-semibold">{Math.round(v.low)}–{Math.round(v.high)}</span></div>
                  ))}
                </div>
              </div>}
            </div>
            <p className="text-xs text-slate-400 mt-3">These zones power your Training Plan, today&apos;s sessions, and the ox-alpha Coach briefing. Update them from any lab above.</p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
