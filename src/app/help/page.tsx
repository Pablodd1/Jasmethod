"use client";

import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { LifeBuoy, MessageCircle, Mail, ChevronDown } from "lucide-react";
import { useState } from "react";

const FAQ: { q: string; a: string }[] = [
  {
    q: "My device isn't syncing. What do I do first?",
    a: "Open Connections. If the device shows a red 'error' chip or an amber 'reconnect needed' chip, tap Reconnect — that fixes expired permissions in one step. If the card says 'Connection not configured by the owner', tap 'Request this connection' and the administrator is notified instantly.",
  },
  {
    q: "How do I get my training plan on my watch?",
    a: "On Today, tap 'Send to watch' on your phone — the share sheet opens; pick Garmin Connect to import the structured workout with per-step alerts. On a computer, 'Download .FIT' gives the same file (import once in Garmin Connect → Workouts).",
  },
  {
    q: "Why did today's session change from the plan?",
    a: "Your daily check-in drives it: sleep, soreness, stress, pain, and the minutes you actually have. The 'Why this session?' line on Today states the exact reason — for example 'TRIM — HRV 12% below your baseline.'",
  },
  {
    q: "I forgot my password / can't log in.",
    a: "Use 'Continue with Google' if your email is a Gmail address. Otherwise contact support below and we'll reset it for you.",
  },
  {
    q: "Is my health data private?",
    a: "Your data belongs to your account alone — device connections, training, check-ins and labs are per-user, and device tokens are encrypted. Coaches only see you if an administrator assigns you to them; you can ask to be unassigned at any time.",
  },
  {
    q: "What does 'estimated' mean on TSS / IF / distance?",
    a: "These are planning estimates from your thresholds and zones (the label says 'est.'). They become exact when you record the session with HR, power or GPS — the plan-versus-actual comparison then uses your real numbers.",
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <div className="pub-container py-12 sm:py-16 max-w-2xl">
        <p className="kicker">Support</p>
        <h1 className="display-2xl mt-4">Help &amp; Support</h1>
        <p className="lede mt-5">
          Fastest answers first — then a human.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          <a
            href="https://t.me/JMMCOACHINGBOT"
            target="_blank"
            rel="noopener noreferrer"
            className="card flex items-start gap-3 hover:border-ocean-400 transition-colors"
          >
            <MessageCircle className="w-6 h-6 text-ocean-600 shrink-0 mt-1" />
            <div>
              <div className="font-display font-bold">Message us on Telegram</div>
              <p className="text-sm text-slate-600 mt-1">
                Fastest path — usually answered same day.
              </p>
            </div>
          </a>
          <a
            href="mailto:coach@jasmiamimethod.com"
            className="card flex items-start gap-3 hover:border-ocean-400 transition-colors"
          >
            <Mail className="w-6 h-6 text-ocean-600 shrink-0 mt-1" />
            <div>
              <div className="font-display font-bold">Email the coach</div>
              <p className="text-sm text-slate-600 mt-1">
                coach@jasmiamimethod.com — for anything detailed or private.
              </p>
            </div>
          </a>
        </div>

        <div className="card mt-6 flex items-start gap-3 border-amber-200 bg-amber-50/50">
          <LifeBuoy className="w-6 h-6 text-amber-600 shrink-0 mt-1" />
          <div>
            <div className="font-display font-bold">
              Medical or injury concern?
            </div>
            <p className="text-sm text-slate-700 mt-1">
              JasMiamiMethod is a coaching tool, not medical care. For chest pain,
              dizziness, pain that changes how you move, or symptoms of illness —
              stop training and contact a health professional.{" "}
              <a href="/terms" className="underline text-ocean-700">
                Terms &amp; health disclaimer
              </a>
              .
            </p>
          </div>
        </div>

        <h2 className="display-lg mt-12 mb-4">Frequently asked</h2>
        <div className="space-y-2">
          {FAQ.map((f, i) => (
            <div key={i} className="card !py-0 overflow-hidden">
              <button
                className="w-full text-left px-5 py-4 flex items-center justify-between gap-3"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-semibold text-sm">{f.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {f.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
