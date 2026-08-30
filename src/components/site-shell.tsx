"use client";

import Link from "next/link";
import { Waves } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-ink-200/70 bg-paper/90 backdrop-blur sticky top-0 z-30">
      <div className="pub-container flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Waves className="w-6 h-6 text-vermillion-500" />
          <span className="font-display text-lg font-bold tracking-tight text-ink-900">
            JasMiamiMethod
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/science" className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors">
            The Science
          </Link>
          <Link href="/onboarding" className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors">
            How It Works
          </Link>
          <Link href="/dashboard" className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors">
            Dashboard
          </Link>
          <Link
            href="/onboarding#signup"
            className="btn-editorial !px-4 !py-2 text-sm"
          >
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-200/70 mt-20">
      <div className="pub-container py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-ink-600">
          <Waves className="w-4 h-4 text-vermillion-500" />
          <span className="font-display font-bold text-ink-900">JasMiamiMethod</span>
        </div>
        <p className="micro">
          Built on post-2000 human-performance research · Miami, FL
        </p>
        <div className="flex gap-5 text-sm">
          <Link href="/science" className="text-ink-600 hover:text-ink-900">Science</Link>
          <Link href="/onboarding" className="text-ink-600 hover:text-ink-900">Onboarding</Link>
        </div>
      </div>
    </footer>
  );
}
