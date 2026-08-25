"use client";

import { useEffect, useState } from "react";
import { Dna, Upload, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { DNA_TRAITS } from "@/lib/science";

export default function DnaPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [provider, setProvider] = useState("23andme");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function load() {
    const res = await fetch("/api/dna");
    const d = await res.json();
    setResults(d.results || []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const fileInput = document.getElementById("dna-file") as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) { setError("Choose your raw DNA file first."); return; }
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("provider", provider);
    const res = await fetch("/api/dna", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) { setError(data.error || "Upload failed"); return; }
    setDone(true);
    load();
    setTimeout(() => setDone(false), 3000);
  }

  const latest = results[0];

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">DNA Analysis</h1>
          <p className="text-slate-500 text-sm">Upload your raw 23andMe or Ancestry file — we analyze performance-relevant SNPs (ACTN3, ACE, PPARGC1A…) from the post-2000 genomics literature.</p>
        </div>

        {/* Upload */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3">Upload Raw DNA</h2>
          <form onSubmit={upload} className="space-y-3">
            <div className="grid md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="label">Provider</label>
                <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="23andme">23andMe</option>
                  <option value="ancestry">AncestryDNA</option>
                  <option value="raw">Other raw file</option>
                </select>
              </div>
              <div>
                <label className="label">Raw file (txt)</label>
                <input id="dna-file" type="file" accept=".txt,.csv" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-ocean-100 file:text-ocean-700 file:px-3 file:py-1.5 file:text-sm" />
              </div>
              <button type="submit" disabled={uploading} className="btn-primary justify-center">
                <Upload className="w-4 h-4" /> {uploading ? "Analyzing…" : "Analyze DNA"}
              </button>
            </div>
          </form>
          {error && <div className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2 mt-3">{error}</div>}
          {done && <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 mt-3">✓ DNA analyzed!</div>}
          <p className="text-[11px] text-slate-400 mt-3">
            Privacy: raw files are processed in-memory; only analyzed SNP results are stored. Delete your file locally after upload if you wish.
          </p>
        </div>

        {/* Results */}
        {latest ? (
          <div className="space-y-5">
            <div className="card bg-ocean-50 border-ocean-200">
              <div className="flex items-center gap-3">
                <Dna className="w-8 h-8 text-ocean-600" />
                <div>
                  <div className="font-display font-bold">{latest.provider}</div>
                  <div className="text-sm text-slate-500">
                    {latest.fileName} · {JSON.parse(latest.summary || "{}").totalVariants || "?"} variants scanned · {latest.variants.length} performance traits analyzed
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {latest.variants.map((v: any) => {
                const trait = DNA_TRAITS.find((t) => t.rsid === v.rsid);
                const icon = v.impact === "beneficial" ? CheckCircle2 : v.impact === "caution" ? AlertCircle : Info;
                const Icon = icon;
                return (
                  <div key={v.id} className={`card ${v.impact === "beneficial" ? "border-emerald-200" : v.impact === "caution" ? "border-amber-200" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-bold">{v.trait}</div>
                        <div className="text-xs text-slate-400">{v.gene} · {v.rsid} · genotype <span className="font-mono font-bold text-slate-600">{v.genotype}</span></div>
                      </div>
                      <span className={`chip ${v.impact === "beneficial" ? "chip-z2" : v.impact === "caution" ? "chip-z6" : "chip-z1"}`}>
                        <Icon className="w-3 h-3" /> {v.impact}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2">{v.note}</p>
                    {trait && (
                      <p className="text-[11px] text-slate-400 mt-2 italic">
                        Evidence: post-2000 genomics of performance (Yang 2003, Montgomery 1998, Bouchard 2011).
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="card bg-amber-50 border-amber-200">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <strong>Science honesty:</strong> Single-SNP associations are real but small. ACTN3 explains a fraction of sprint ability; trainability is polygenic (HERITAGE: ~50% of VO2max response is genetic, but everyone responds to training). Use this as insight, not destiny — the plan still adapts to your data.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card text-center py-16 text-slate-400">
            <Dna className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">No DNA uploaded yet</p>
            <p className="text-sm">Download your raw data from 23andMe (Settings → Raw Data) or Ancestry, then upload it here.</p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
