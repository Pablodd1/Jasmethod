"use client";

import Link from "next/link";
import { Waves, Globe } from "lucide-react";
import { useAuth } from "./auth";
import { LANGS, t, type Lang } from "@/lib/i18n";

export function PublicLanguageSelect({ compact }: { compact?: boolean }) {
  const { language, setLanguage } = useAuth();
  if (compact) {
    return (
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Lang)}
        aria-label="Language"
        className="bg-transparent text-ink-600 text-xs font-medium border border-ink-200 rounded-md px-2 py-1 focus:outline-none hover:text-ink-900"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.native}</option>
        ))}
      </select>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Globe className="w-4 h-4 text-ink-400 shrink-0" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Lang)}
        aria-label="Language"
        className="bg-transparent text-ink-600 text-xs font-medium border border-ink-200 rounded-md px-2 py-1 focus:outline-none hover:text-ink-900"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>{l.native}</option>
        ))}
      </select>
    </div>
  );
}

export function SiteHeader() {
  const { language } = useAuth();
  const { user } = useAuth();
  return (
    <header className="border-b border-ink-200/70 bg-paper/90 backdrop-blur sticky top-0 z-30">
      <div className="pub-container flex flex-wrap items-center justify-between py-4 gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Waves className="w-6 h-6 text-vermillion-500" />
          <span className="font-display text-lg font-bold tracking-tight text-ink-900">
            JasMiamiMethod
          </span>
        </Link>
        <nav className="flex items-center gap-4 md:gap-6">
          <Link href="/science" className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors">
            {t(language, "pub.science")}
          </Link>
          <Link href="/how-it-works" className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors hidden sm:inline">
            {t(language, "pub.howItWorks")}
          </Link>
          {/* Logged-in athletes keep the app one tap away on every public page
              (science guides included). Logged-out visitors get the same door:
              /today redirects to sign-in, then straight back to training. */}
          <Link
            href="/today"
            className={`text-sm font-semibold transition-colors ${
              user
                ? "text-vermillion-600 hover:text-vermillion-500"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            {t(language, "pub.dashboard")} →
          </Link>
          <PublicLanguageSelect compact />
          {!user && (
            <Link
              href="/onboarding#signup"
              className="btn-editorial !px-4 !py-2 text-sm"
            >
              {t(language, "pub.startFree")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { language } = useAuth();
  return (
    <footer className="border-t border-ink-200/70 mt-20">
      <div className="pub-container py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-ink-600">
          <Waves className="w-4 h-4 text-vermillion-500" />
          <span className="font-display font-bold text-ink-900">JasMiamiMethod</span>
        </div>
        <p className="micro">
          {t(language, "pub.footerBuilt")}
        </p>
        <div className="flex gap-5 text-sm items-center">
          <Link href="/science" className="text-ink-600 hover:text-ink-900">{t(language, "pub.science")}</Link>
          <Link href="/onboarding" className="text-ink-600 hover:text-ink-900">{t(language, "pub.onboarding")}</Link>
        </div>
      </div>
    </footer>
  );
}
