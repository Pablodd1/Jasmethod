import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "How to use JMM | Daily coaching guide",
  description: "A practical guide to your account, daily check-ins, training, devices, coaching, and account recovery.",
  alternates: { canonical: "/how-it-works" },
};

const steps = [
  { id: "account", title: "1. Create or recover the right account", href: "/login", link: "Open sign-in", paragraphs: [
    "New athletes can register with email and password, or use Google when the button is enabled. Apple and ChatGPT are not offered in this demo.",
    "Already have training data? Sign in to your existing account first, then open Link sign-in options to add Google. A matching email does not automatically merge accounts. Linking from your existing account keeps its training history together.",
    "Forgot your password? Use password recovery with the email belonging to that account. Check spam and follow the single-use link. Do not register again to recover missing records. If you use separate administrator/coach and athlete accounts, sign out before switching and check the displayed account identity.",
  ] },
  { id: "profile", title: "2. Complete your athlete profile and goal", href: "/settings", link: "Open settings", paragraphs: [
    "Review your sport, experience, time zone, available training days, health limitations, and the profile fields relevant to your training. Add your race or performance goal with its date when available. Accurate availability matters as much as a wearable measurement.",
    "Enter known thresholds and test results with their dates. Use the baseline/testing options available for your sport before treating zones as individualized. Estimated zones and forecasts are starting points; review them after reliable tests, a change in fitness, or a long interruption.",
    "Discuss the purpose of the next cycle with your coach: the main performance priority, a realistic time budget, key practice or test sessions, and recovery days. Review the proposed schedule before confirming it. The training mix should reflect your goal, history, availability and response; no fixed easy-to-hard ratio is required for every athlete.",
  ] },
  { id: "devices", title: "3. Connect your devices, or work without one", href: "/connectors", link: "Open connections", paragraphs: [
    "Select a supported provider, authorize access on that provider's website, and return to JMM. That initial authorization is required for each athlete. Once configured, supported background sync can collect data without pressing Sync every day, but permissions can expire or be revoked and require reconnection.",
    "Check the provider status, last successful sync, and what data actually arrived. Access to months of history depends on the provider's permissions and historical-data limits. Connecting one provider does not automatically grant access to every device or prove that recovery metrics were imported.",
    "No wearable is required to record a daily check-in and follow training. Enter sleep, soreness, stress, pain, available time, and other supported fields yourself. Add workout duration and effort through the available feedback or logging screens. Leave unknown measurements missing rather than inventing HRV, resting heart rate, pace, or power.",
  ] },
  { id: "daily", title: "4. Check in, then review today's training", href: "/checkin", link: "Open daily check-in", paragraphs: [
    "Before training, update how you slept, how you feel, and the time you have today. Review any symptoms or pain honestly. Check the date and account so the observations apply to the correct athlete and session.",
    "On Today, review the session purpose, warm-up, work and recovery steps, intensity targets, and the explanation for any adjustment. Ask the AI coach to clarify the plan or discuss a change. Review proposed changes and any confirmation step before treating them as saved or delivered.",
    "A daily suggestion is part of your longer training plan, not proof of recovery or a guarantee against injury. Discuss persistent fatigue, pain, illness, or unexplained performance changes with an appropriate professional.",
  ] },
  { id: "delivery", title: "5. Send a supported workout and confirm it on the device", href: "/today", link: "Open today's session", paragraphs: [
    "Use the delivery option offered for your connected provider. Importing completed activities and sending future structured workouts are different capabilities. A connection to Strava, Oura, or another service does not by itself mean that service can receive structured watch workouts.",
    "Review the target device, session date, steps, and pace/power/heart-rate units. Check the reported delivery status, then confirm the actual workout appears in the device or its companion app before starting. A file download, queued job, or accepted API request alone is not proof the watch received the workout.",
    "If direct delivery is unavailable, use only an export/import path supported by your device and the file format offered. You can still read the session in JMM and record completion manually. Report errors through Help with the provider name and the exact error, without tokens or passwords.",
  ] },
  { id: "feedback", title: "6. Record what happened and review the next day", href: "/coach", link: "Open daily coaching", paragraphs: [
    "After training, check that the activity or your manual entry is present. Record perceived effort, completion, pain, and anything that changed from the plan. Distinguish the planned session from the activity actually performed; incomplete or delayed sync should not be treated as a completed workout.",
    "Use the in-app AI coach for training questions and the assigned human-coach conversation for discussion with your coach. These are separate from technical support. Notifications and Telegram coaching require their own pairing and preferences; only enable the messages you want.",
    "Review your calendar, progress, and testing periodically. Fueling and supplement suggestions should be checked against your actual session, tolerances, dietary needs, and any clinical advice. Race forecasts and training metrics can remain estimates even when a wearable is connected.",
  ] },
];

export default function HowItWorksPage() {
  return <div className="min-h-screen bg-paper">
    <SiteHeader />
    <main className="pub-container py-12 sm:py-16 max-w-4xl">
      <p className="kicker">Getting started</p>
      <h1 className="display-2xl mt-4">How to use JMM</h1>
      <p className="lede mt-5">From your first sign-in to a daily coaching routine, with or without a wearable.</p>
      <div className="grid sm:grid-cols-2 gap-4 mt-8"><Link className="card block" href="/personal-coaching"><h2 className="font-bold">Meet your daily coach</h2><p className="mt-2">How your profile, check-in, reviewed session and actual results work together.</p></Link><Link className="card block" href="/race-prediction"><h2 className="font-bold">Explore AdvanzedRacing</h2><p className="mt-2">Race preparation, HYROX scenarios and the current limits of personalized prediction.</p></Link></div>
      <nav aria-label="Guide sections" className="card mt-8 flex flex-wrap gap-4 text-sm">
        {steps.map(step => <a key={step.id} href={`#${step.id}`} className="underline text-ocean-700">{step.title}</a>)}
        <a href="#coach-admin" className="underline text-ocean-700">For coaches and administrators</a>
        <a href="#recovery-days" className="underline text-ocean-700">Recovery days</a>
        <a href="#hyrox" className="underline text-ocean-700">HYROX training review</a>
      </nav>
      <div className="space-y-6 mt-8">{steps.map(step => <section id={step.id} key={step.id} className="card scroll-mt-24">
        <h2 className="display-lg">{step.title}</h2>
        {step.paragraphs.map(paragraph => <p key={paragraph} className="text-slate-700 leading-relaxed mt-4">{paragraph}</p>)}
        <a href={step.href} className="inline-block mt-5 font-semibold underline text-ocean-700">{step.link}</a>
        {step.id === "account" && <div className="flex gap-5 mt-4"><a href="/forgot-password" className="underline text-ocean-700">Recover your password</a><a href="/login?link=1" className="underline text-ocean-700">Link sign-in options</a></div>}
      </section>)}</div>
      <section id="recovery-days" className="card mt-6 scroll-mt-24">
        <h2 className="display-lg">Make recovery days intentional</h2>
        <p className="text-slate-700 leading-relaxed mt-4">Check in on a planned day off too. Report symptoms, sleep, soreness and life stress, then review the recovery guidance. Where the guidance allows it and you feel well, up to 20 minutes of very easy movement in a comfortable activity is optional. Rest is a valid choice. Do not turn missed training into extra work on a rest day or exercise through illness or pain to complete a checklist.</p>
        <p className="text-slate-700 leading-relaxed mt-4">Plan enough time for sleep and regular meals, and account for work, family and travel demands. If useful, add a short comfortable breathing, meditation or race-visualization practice. These are optional routines, not tests of recovery. Log only movement you actually performed, or explicitly confirm rest; a scheduled off-day does not mean the app observed that you rested.</p>
        <Link href="/science#recovery" className="inline-block mt-5 underline font-semibold text-ocean-700">Recovery guidance and evidence limits</Link>
      </section>
      <section id="hyrox" className="card mt-6 scroll-mt-24">
        <h2 className="display-lg">Review HYROX as running plus station work</h2>
        <p className="text-slate-700 leading-relaxed mt-4">Tell your coach your division, event date, running background, station experience and equipment access. Review station loads and movement standards for the event. Use a repeatable run or station assessment that fits your experience; a full race simulation is not a required beginner baseline.</p>
        <p className="text-slate-700 leading-relaxed mt-4">Use the split planner as a scenario to discuss, then log actual run and station splits when available. Record the workout you completed, overall effort, pain, and which movement or transition limited you. Discuss whether the next cycle should emphasize running, station technique, strength or combined practice, while keeping hard work and recovery manageable. Enter observations in the available workout feedback or coach conversation; not every detail is an automatically analyzed profile field.</p>
        <p className="text-slate-700 leading-relaxed mt-4">Plan food and drink for your expected duration and tolerance. Practice any race intake during suitable training, and record stomach discomfort as well as grams consumed. Do not assume a fueling target or predicted split has been validated for you simply because it appears in an app.</p>
        <div className="flex flex-wrap gap-5 mt-5"><Link href="/hyrox" className="underline font-semibold text-ocean-700">Open HYROX split planner</Link><Link href="/science#hyrox" className="underline font-semibold text-ocean-700">Read the evidence and limitations</Link></div>
      </section>
      <section id="coach-admin" className="card mt-6 scroll-mt-24">
        <h2 className="display-lg">For coaches and administrators</h2>
        <p className="text-slate-700 leading-relaxed mt-4">Use the authorized coach/administrator account for athlete management. Select the intended athlete before reviewing data, editing a plan, adjusting zones, or handling account recovery. Your personal athlete profile and another athlete&apos;s records are separate; signing into a different account does not combine their histories.</p>
        <p className="text-slate-700 leading-relaxed mt-4">Review assignments, the athlete&apos;s current goal, source dates, and any missing data before making changes. After saving, check the resulting session and delivery status. Discuss changes through the available coaching conversation. Administrator access does not replace the athlete&apos;s authorization to connect an external device account.</p>
        <p className="text-slate-700 leading-relaxed mt-4">To help an athlete regain access, open the administrator dashboard, select the athlete, then use Account recovery → Send password reset email. Check the stored account email before sending. The recipient follows the single-use link and chooses their own password; their role and training data remain unchanged. Email-provider acceptance does not prove the message reached the inbox. Never ask for the athlete&apos;s existing password or share recovery links in a group.</p>
        <a href="/admin" className="inline-block mt-5 underline font-semibold text-ocean-700">Open administrator dashboard</a>
      </section>
      <section className="card mt-6">
        <h2 className="display-lg">Need help?</h2>
        <p className="text-slate-700 mt-4">Use Help for account recovery, device issues, and inquiries. It shows the configured contact options and whether a support message was accepted. Support messages go to the JMM team. Training questions can go to the in-app AI coach; messages are not automatically forwarded between those conversations.</p>
        <a href="/help" className="inline-block mt-5 underline font-semibold text-ocean-700">Open Help &amp; Support</a>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
