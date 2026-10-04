import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "J Metrics: understand your training load — JasMiamiMethod",
  description: "How JStress, J Base, J Recent and J Balance describe training, where their data comes from, and what they cannot tell you.",
  alternates: { canonical: "/metrics" },
};

const metrics = [
  { name: "JStress", formula: "Completed minutes × session RPE", meaning: "The reported internal load of one completed session, in arbitrary units (AU). Add completed sessions to describe a day.", limit: "Requires actual duration and your whole-session effort rating. It is not a power measurement or a performance score." },
  { name: "J Base", formula: "42-day exponentially weighted daily JStress", meaning: "A slower-moving description of your recorded training load. Recent days receive more weight.", limit: "It does not measure aerobic fitness, strength or injury resistance. A short or incomplete history weakens interpretation." },
  { name: "J Recent", formula: "7-day exponentially weighted daily JStress", meaning: "A faster-moving description of recent recorded load on the same session-RPE scale.", limit: "It does not measure physiological fatigue, illness or recovery directly." },
  { name: "J Balance", formula: "J Base − J Recent", meaning: "A comparison between the slower and faster load trends. Negative means recent load is above the longer trend; positive means it is below.", limit: "Neither sign guarantees readiness. There is no universal safe, optimal or race-ready target." },
];

export default function MetricsPage() {
  return <div className="min-h-screen bg-paper">
    <SiteHeader />
    <main className="pub-container py-12 sm:py-16 text-ink-900">
      <p className="kicker">J Data · Method guide</p>
      <h1 className="display-2xl mt-4 max-w-3xl">Understand the work. Understand the limits.</h1>
      <p className="deck mt-5 max-w-3xl">J Metrics are JMM names for clearly described calculations. JStress uses the published session-RPE method. These names do not turn a training log into a laboratory test.</p>
      <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold underline underline-offset-4">
        <Link href="/science/j-metrics">Read the evidence and coaching examples</Link>
        <Link href="/how-it-works">How to use JMM</Link>
      </div>

      <section className="mt-12" aria-labelledby="definitions">
        <h2 id="definitions" className="font-display text-3xl font-bold">Four descriptions, one consistent scale</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {metrics.map(metric => <article key={metric.name} className="rounded-2xl border border-ink-200 bg-white p-6">
            <h3 className="font-display text-2xl font-bold">{metric.name}</h3>
            <p className="mt-3 font-mono text-sm">{metric.formula}</p>
            <p className="mt-3 leading-relaxed">{metric.meaning}</p>
            <p className="mt-3 text-sm leading-relaxed"><strong>Limit:</strong> {metric.limit}</p>
          </article>)}
        </div>
        <p className="mt-5 max-w-3xl leading-relaxed">The 7-day and 42-day settings are JMM model choices, not personal biological constants. Read them as load trends, alongside history completeness, symptoms, sport demands and performance tests.</p>
        <details className="mt-5 max-w-3xl rounded-xl border border-ink-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">Exact calculation and history requirements</summary>
          <div className="mt-4 space-y-3 leading-relaxed">
            <p>A day is known only when every recorded completed session has actual minutes and a reported RPE, or when you explicitly confirm a rest day with no completed training. Confirmed rest contributes zero. An unrecorded day is unknown.</p>
            <p>For each uninterrupted sequence of known days, the first daily total seeds each average. Later days use: new average = previous average + α × (daily total − previous average), where α = 1 − exp(−1/τ), with τ = 7 for J Recent and 42 for J Base.</p>
            <p>An unknown day resets that sequence. J Recent appears after 7 consecutive known days; J Base and J Balance appear after 42. These are JMM display rules, not validated safety thresholds. Individual session JStress can be shown sooner.</p>
            <p>Do not mark an unknown day as rest just to reveal a chart. Correct missing sessions and effort ratings so the trend reflects the work you actually completed.</p>
          </div>
        </details>
      </section>

      <section className="mt-12 max-w-3xl space-y-4" aria-labelledby="recording">
        <h2 id="recording" className="font-display text-3xl font-bold">No watch? Your report still matters.</h2>
        <ol className="list-decimal pl-6 space-y-3 leading-relaxed">
          <li>In Calendar, open an existing activity and choose Edit result, or use Log workout result on Today. Save actual minutes, including the work you did during a partial or substituted session. Use a consistent convention for warm-up, recovery periods and cool-down.</li>
          <li>Rate the whole session from 0 (no effort) to 10 (maximal effort). Use the same timing after sessions so reports are comparable; do not rate only the hardest interval.</li>
          <li>Add sport, session purpose, pain, soreness, sleep, illness symptoms and whether you completed the intended work. These explain a number; they are not secretly added to JStress.</li>
          <li>For an actual day without training, use the rest confirmation in Today’s J Metrics card. Do not confirm rest when records are merely missing. Compare your own comparable sessions over time; a higher score is not automatically a better workout.</li>
        </ol>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="font-semibold">Illustration only — not your training data</p>
          <p className="mt-2">45 completed minutes × session RPE 4 = <strong>180 AU JStress</strong>. A 30-minute session at RPE 6 also gives 180 AU, but the sessions can produce different adaptations and mechanical strain.</p>
        </div>
      </section>

      <section className="mt-12 max-w-3xl space-y-4" aria-labelledby="honest-data">
        <h2 id="honest-data" className="font-display text-3xl font-bold">What an honest chart needs</h2>
        <ul className="list-disc pl-6 space-y-3 leading-relaxed">
          <li><strong>Source:</strong> distinguish athlete-reported effort, device-recorded duration and coach-entered information.</li>
          <li><strong>Missing data:</strong> missing effort or duration means no completed-session JStress. A blank log does not prove a rest day. A partial total can understate the work.</li>
          <li><strong>Duplicate records:</strong> a plan linked to an imported activity is counted only through that activity. Unlinked duplicate records are not automatically detected; review apparent duplicates before interpreting totals.</li>
          <li><strong>Plans versus completion:</strong> a planned-load estimate describes an intention. It must not be presented as completed training or replace the athlete’s report.</li>
          <li><strong>Same scale:</strong> imported TSS, NP or IF and legacy calculations are separate values. They are not JStress, and cannot be silently merged into its trend.</li>
        </ul>
        <p className="leading-relaxed">Ask the AI coach: “Which sessions and dates support this trend? What is missing? Why does this affect today’s session?” A useful answer explains the evidence and uncertainty. It cannot diagnose an injury or guarantee a race result from a load score.</p>
      </section>

      <section className="mt-12 max-w-3xl space-y-4" aria-labelledby="sources">
        <h2 id="sources" className="font-display text-3xl font-bold">Methods and attribution</h2>
        <p className="leading-relaxed">Session-RPE is a published method, not a JMM invention. Foster and colleagues evaluated it during cycling and basketball. That supports using perceived effort to describe load; it does not validate a new JMM composite, every sport-specific prescription, or an injury forecast. <a className="underline underline-offset-4" href="https://pubmed.ncbi.nlm.nih.gov/11708692/">Foster et al., 2001 — PubMed</a>.</p>
        <p className="leading-relaxed">TrainingPeaks describes its own <a className="underline underline-offset-4" href="https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained">Training Stress Score methods</a>. References to third-party metrics identify those methods and do not imply affiliation. JMM naming is not a statement of trademark registration or legal clearance.</p>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
