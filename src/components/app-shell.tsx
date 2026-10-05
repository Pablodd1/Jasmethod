"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  Dumbbell,
  Apple,
  Play,
  Zap,
  FlaskConical,
  Settings,
  Waves,
  LogOut,
  Flag,
  ClipboardCheck,
  Bell,
  Globe,
  Gauge,
  Shield,
  Trophy,
  TestTubes,
  Moon,
  Bike,
  Dna,
  BookOpen,
  Layers,
  LifeBuoy,
  Sparkles,
} from "lucide-react";
import { useAuth } from "./auth";
import { LANGS, t, type Lang } from "@/lib/i18n";

const NAV = [
  { href: "/today", key: "nav.today", icon: Play },
  { href: "/daily", key: "nav.daily", icon: Zap },
  { href: "/dashboard", key: "nav.dashboard", icon: Home },
  { href: "/checkin", key: "nav.checkin", icon: ClipboardCheck },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
  { href: "/training", key: "nav.training", icon: Dumbbell },
  { href: "/settings", key: "nav.settings", icon: Settings },
  { href: "/help", key: "nav.help", icon: LifeBuoy },
  { href: "/admin", key: "nav.admin", icon: Shield, adminOnly: true },
];

// Secondary group — these pages were previously reachable only through scattered
// links; every tab gets exactly one home in the nav so content stops being
// re-embedded elsewhere.
const NAV_MORE = [
  { href: "/hyrox", key: "nav.hyrox", icon: Layers },
  { href: "/races", key: "nav.races", icon: Flag },
  { href: "/races/forecast", key: "nav.forecast", icon: Gauge },
  { href: "/nutrition", key: "nav.nutrition", icon: Apple },
  { href: "/blood", key: "nav.blood", icon: FlaskConical },
  { href: "/reminders", key: "nav.reminders", icon: Bell },

  { href: "/labs", key: "nav.labs", icon: TestTubes },
  { href: "/sleep", key: "nav.sleep", icon: Moon },
  { href: "/gear", key: "nav.gear", icon: Bike },
  { href: "/dna", key: "nav.dna", icon: Dna },
  { href: "/science", key: "nav.science", icon: BookOpen },
];

function LanguageSelect({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
}) {
  return (
    <select
      value={lang}
      onChange={(e) => onChange(e.target.value as Lang)}
      className="w-full bg-ocean-900 text-ocean-100 text-xs rounded-lg px-2 py-1.5 border border-ocean-800 focus:outline-none"
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.native}
        </option>
      ))}
    </select>
  );
}

import { ErrorTelemetry } from "./error-telemetry";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout, refresh } = useAuth();
  const lang = (user?.language || "es") as Lang;

  async function setLanguage(l: Lang) {
    await fetch("/api/language", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: l }),
    });
    await refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-60 flex-col bg-ocean-950 text-white fixed inset-y-0 left-0 z-20">
        <div className="px-5 py-6 border-b border-ocean-900">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="JasMiamiMethod" className="w-8 h-8 rounded-lg" />
            <div>
              <div className="font-display font-bold text-lg leading-tight">
                JasMiamiMethod
              </div>
              <div className="text-[10px] text-ocean-400 uppercase tracking-widest">
                Science-Backed Triathlon
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.filter(
            (item) =>
              !item.adminOnly ||
              user?.role === "admin" ||
              user?.role === "coach",
          ).map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-ocean-600 text-white"
                    : "text-ocean-300 hover:bg-ocean-900 hover:text-white"
                }`}
              >
                <Icon className="w-4.5 h-4.5 w-5 h-5" />
                {t(lang, item.key)}
              </Link>
            );
          })}
          <details open={NAV_MORE.some((i) => pathname.startsWith(i.href))}>
            <summary className="px-3 pt-4 pb-2 text-xs uppercase tracking-widest text-ocean-400 cursor-pointer">
              {t(lang, "nav.more")}
            </summary>
            {NAV_MORE.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? "bg-ocean-600 text-white"
                      : "text-ocean-300 hover:bg-ocean-900 hover:text-white"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(lang, item.key)}
                </Link>
              );
            })}
          </details>
          <Link
            href="/connectors"
            className="block px-3 py-3 text-sm text-ocean-300"
          >
            {lang === "es" ? "Conexiones" : "Connections"}
          </Link>
        </nav>
        <div className="px-5 py-4 border-t border-ocean-900 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-ocean-400 shrink-0" />
            <LanguageSelect lang={lang} onChange={setLanguage} />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-ocean-600 flex items-center justify-center font-bold text-lg">
              {user?.avatar || user?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {user?.name || "Athlete"}
              </div>
              <div className="text-[11px] text-ocean-400 truncate">
                {user?.email || ""}
              </div>
            </div>
            <button
              onClick={() => logout()}
              title="Log out"
              className="text-ocean-400 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-ocean-950 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="JMMai" className="w-7 h-7 rounded-lg" />
          <span className="font-display font-bold">JMMai</span>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-ocean-400" />
          <select
            value={lang}
            onChange={(e) => setLanguage(e.target.value as Lang)}
            className="bg-ocean-900 text-ocean-100 text-xs rounded px-1.5 py-1 border border-ocean-800"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native}
              </option>
            ))}
          </select>
          <details className="relative">
            <summary className="text-sm cursor-pointer">Menu</summary>
            <div className="absolute right-0 top-8 w-52 bg-ocean-950 p-3 rounded-lg shadow-lg max-h-[75vh] overflow-auto">
              {[...NAV, ...NAV_MORE]
                .filter(
                  (item) =>
                    !("adminOnly" in item) ||
                    user?.role === "admin" ||
                    user?.role === "coach",
                )
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block py-2 text-sm"
                  >
                    {t(lang, item.key)}
                  </Link>
                ))}
              <Link href="/connectors" className="block py-2 text-sm">
                Connections
              </Link>
              <button onClick={() => logout()} className="py-2 text-sm">
                Log out
              </button>
            </div>
          </details>
        </div>
      </div>

      <main className="flex-1 min-w-0 md:ml-60 pt-14 md:pt-0 pb-16 md:pb-6">
        <ErrorTelemetry />
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">
          {children}
          <footer className="mt-8 text-xs text-slate-500">
            {lang === "es" ? "Los gráficos y análisis pueden incluir datos de dispositivos Garmin, importados mediante Intervals.icu." : "Charts and analysis may include data from Garmin devices, imported through Intervals.icu."}
          </footer>
        </div>
      </main>
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-sand-200 flex justify-around py-2">
      {NAV.slice(0, 5).map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? "text-ocean-600" : "text-slate-400"}`}
          >
            <Icon className="w-5 h-5" />
            {t(lang, item.key).split(" ")[0]}
          </Link>
        );
      })}
      {/* KCoach — one tap from ANY page (the coach is never buried) */}
      <Link
        href="/today#jasai"
        className="flex flex-col items-center gap-0.5 text-[10px] text-vermillion-500"
      >
        <Sparkles className="w-5 h-5" />
        KCoach
      </Link>
    </div>
  );
}
