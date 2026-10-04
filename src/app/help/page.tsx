import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { SupportContact } from "@/components/support-contact";
import { supportContacts } from "@/lib/support-contact";
import { supportTelegramConfigured } from "@/lib/support-delivery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Help & Support | JMM",
  description: "Get help with JMM sign-in, device connections, and daily coaching.",
  alternates: { canonical: "/help" },
};

const FAQ = [
  { q: "My device is not syncing. What should I check?", a: "Open Connections and check the provider status and last successful sync. Reconnect if authorization expired. Record the provider name, time, and error message when contacting support. A connected account alone does not prove that new data has arrived." },
  { q: "How do I follow training on my watch?", a: "Check the delivery options offered for your device on Today and Connections. Availability depends on the provider and enabled integrations. A downloaded file or a successful send request does not confirm delivery to the watch; check the workout on the device before training." },
  { q: "Why did today's session change?", a: "Review the explanation alongside your daily session and your latest check-in. Ask the in-app AI coach about the recommendation, or discuss it with your assigned human coach. Missing measurements should not be treated as measured recovery data." },
  { q: "Can I register or sign in with Google?", a: "Google can create new accounts. If an account already uses your email, first sign in to that existing account, then link the provider. This protects your existing training history. Apple and ChatGPT are not offered in this demo." },
  { q: "Does recorded data make every training metric exact?", a: "No. JStress is completed minutes multiplied by your reported session effort, in arbitrary units (AU). It is a subjective training-load estimate, not a measurement of injury risk or readiness. J Base, J Recent and J Balance need sufficient recorded history; missing data stay unknown. Sensor observations and race forecasts also have limits. Read the J Metrics guide for formulas, examples and sources." },
];

export default function HelpPage() {
  return <div className="min-h-screen bg-paper">
    <SiteHeader />
    <main className="pub-container py-12 sm:py-16 max-w-2xl">
      <p className="kicker">Support</p>
      <h1 className="display-2xl mt-4">Help &amp; Support</h1>
      <p className="lede mt-5">Account help, technical questions, and coaching conversations.</p>
      <p className="mt-4"><a href="/metrics" className="underline text-ocean-700">Understand JStress, J Base, J Recent and J Balance</a></p>
      <section className="card mt-8" aria-labelledby="account-help">
        <h2 id="account-help" className="font-display font-bold text-xl">Cannot sign in?</h2>
        <p className="text-sm text-slate-600 mt-2">Recover your existing account to keep your training history. Do not create another account to recover missing records.</p>
        <div className="flex flex-wrap gap-4 mt-4">
          <a href="/forgot-password" className="underline text-ocean-700 font-semibold">Reset your password</a>
          <a href="/login" className="underline text-ocean-700 font-semibold">Sign in</a>
          <a href="/login?link=1" className="underline text-ocean-700 font-semibold">Link Google after signing in</a>
        </div>
      </section>
      <SupportContact contacts={supportContacts(process.env)} telegramSupportAvailable={supportTelegramConfigured()} />
      <section className="card mt-6" aria-labelledby="ai-coaching">
        <h2 id="ai-coaching" className="font-display font-bold text-xl">Training questions for the AI coach</h2>
        <p className="text-sm text-slate-600 mt-2">After signing in, use the in-app coach to discuss your training and daily session. It cannot recover your password or fix account access. Human coach conversations, when assigned, are also on Today. Contact the team separately for technical support; messages are not automatically forwarded between these channels.</p>
        <a href="/today#jasai" className="inline-block mt-4 underline text-ocean-700 font-semibold">Open daily coaching</a>
      </section>
      <h2 className="display-lg mt-12 mb-4">Frequently asked</h2>
      <div className="space-y-2">{FAQ.map(item => <details key={item.q} className="card">
        <summary className="font-semibold text-sm cursor-pointer focus-visible:outline focus-visible:outline-2">{item.q}</summary>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">{item.a}</p>
      </details>)}</div>
      <p className="text-sm text-slate-600 mt-8">JMM provides coaching, not medical care. For urgent health concerns, contact a health professional or local emergency services. <a href="/terms" className="underline text-ocean-700">Terms and health disclaimer</a>.</p>
    </main>
    <SiteFooter />
  </div>;
}
