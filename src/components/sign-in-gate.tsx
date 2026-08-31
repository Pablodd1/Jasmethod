"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AuthCard } from "@/components/auth-card";

// English-only gate by request. ponytail: add i18n keys if this page must follow
// the site's 5-language selector like the editorial landing does.
const SUMMARY = [
  "Sports science, not folklore",
  "Years of coaching experience",
  "Hundreds of hours of coaching",
  "AI-smart coaching",
  "Daily — not weekly — training",
  "Biometrics",
  "All based on your biology and feelings",
];

export default function SignInGate() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      <main className="pub-container py-14 sm:py-20">
        <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-start">
          {/* Left — English slogan + summary + HOW IT WORKS */}
          <div>
            <p className="kicker">JasMiamiMethod</p>
            <h1 className="display-2xl mt-4">
              Training that reads <span className="text-vermillion-500">your body</span>, not your
              ego.
            </h1>
            <div className="mt-4 inline-flex items-center gap-2 text-ink-600">
              <span className="font-mono text-xs text-vermillion-500 tracking-widest">«</span>
              <p className="font-display text-lg italic">Data, not ego.</p>
              <span className="font-mono text-xs text-vermillion-500 tracking-widest">»</span>
            </div>

            <ul className="mt-8 space-y-3">
              {SUMMARY.map((s) => (
                <li key={s} className="flex items-start gap-2.5 text-ink-700">
                  <span className="text-vermillion-500 mt-0.5 shrink-0">✓</span>
                  <span className="font-medium">{s}</span>
                </li>
              ))}
            </ul>

            <Link href="/how-it-works" className="btn-editorial-accent mt-9">
              How it works <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Right — sign in / register */}
          <AuthCard initialMode="login" />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
