"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  Dumbbell,
  Apple,
  Play,
  FlaskConical,
  Settings,
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
  Plug,
} from "lucide-react";
import { useAuth } from "./auth";
import { LANGS, t, type Lang } from "@/lib/i18n";

const NAV = [
  { href: "/today", key: "nav.today", icon: Play },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays, en: "Plan & Calendar", es: "Plan y calendario" },
  { href: "/coach", key: "nav.coach", icon: Sparkles },
  { href: "/settings", key: "nav.settings", icon: Settings, en: "Profile", es: "Perfil" },
];

const TOOL_GROUPS = [
  { en: "Training & progress", es: "Entrenamiento y progreso", items: [
  { href: "/training", key: "nav.training", icon: Dumbbell },
  { href: "/checkin", key: "nav.checkin", icon: ClipboardCheck },
  { href: "/dashboard", key: "nav.dashboard", icon: Home },
  { href: "/hyrox", key: "nav.hyrox", icon: Layers },
  { href: "/races", key: "nav.races", icon: Flag },
  { href: "/races/forecast", key: "nav.forecast", icon: Gauge },
  ] },
  { en: "Recovery & science", es: "Recuperación y ciencia", items: [
  { href: "/nutrition", key: "nav.nutrition", icon: Apple },
  { href: "/sleep", key: "nav.sleep", icon: Moon },
  { href: "/blood", key: "nav.blood", icon: FlaskConical },
  { href: "/labs", key: "nav.labs", icon: TestTubes },
  { href: "/dna", key: "nav.dna", icon: Dna },
  { href: "/science", key: "nav.science", icon: BookOpen },
  ] },
  { en: "Setup & support", es: "Configuración y ayuda", items: [
  { href: "/onboard?redo=1", key: "nav.settings", icon: ClipboardCheck, en: "Review athlete setup", es: "Revisar configuración del atleta" },
  { href: "/connectors", key: "nav.settings", icon: Plug, en: "Connections", es: "Conexiones" },
  { href: "/gear", key: "nav.gear", icon: Bike },
  { href: "/reminders", key: "nav.reminders", icon: Bell },
  { href: "/help", key: "nav.help", icon: LifeBuoy },
  ] },
];

type NavItem = { href: string; key: string; icon: typeof Play; en?: string; es?: string };
function navLabel(item: NavItem, lang: Lang) {
  return item.en ? lang === "es" ? item.es || item.en : item.en : t(lang, item.key);
}
function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  return pathname === path || (path !== "/races" && pathname.startsWith(path + "/"));
}

function ToolLinks({ pathname, lang, canManage, onNavigate }: { pathname: string; lang: Lang; canManage: boolean; onNavigate?: () => void }) {
  return <>
    {TOOL_GROUPS.map(group => <details key={group.en} open={group.items.some(item => isActive(pathname, item.href))}>
      <summary className="px-3 pt-4 pb-2 text-xs font-semibold text-ocean-200 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{lang === "es" ? group.es : group.en}</summary>
      {group.items.map(item => {
        const active = isActive(pathname, item.href), Icon = item.icon;
        return <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${active ? "bg-ocean-600 text-white" : "text-ocean-200 hover:bg-ocean-900 hover:text-white"}`}>
          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />{navLabel(item, lang)}
        </Link>;
      })}
    </details>)}
    {canManage && <Link href="/admin" onClick={onNavigate} aria-current={pathname.startsWith("/admin") ? "page" : undefined}
      className={`flex items-center gap-3 px-3 py-3 mt-2 text-sm font-medium rounded-xl ${pathname.startsWith("/admin") ? "bg-ocean-600 text-white" : "text-ocean-200 hover:bg-ocean-900"}`}>
      <Shield className="w-4 h-4" aria-hidden="true" />{t(lang, "nav.admin")}
    </Link>}
  </>;
}

function LanguageSelect({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
}) {
  return (
    <select
      aria-label={lang === "es" ? "Idioma" : "Language"}
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
  const canManage = user?.role === "admin" || user?.role === "coach";
  const mobileMenu = useRef<HTMLDetailsElement>(null);

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
                {lang === "es" ? "Entrenamiento diario" : "Daily coaching"}
              </div>
            </div>
          </div>
        </div>
        <nav aria-label={lang === "es" ? "Navegación principal" : "Main navigation"} className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-ocean-600 text-white"
                    : "text-ocean-300 hover:bg-ocean-900 hover:text-white"
                }`}
              >
                <Icon className="w-4.5 h-4.5 w-5 h-5" />
                {navLabel(item, lang)}
              </Link>
            );
          })}
          <ToolLinks pathname={pathname} lang={lang} canManage={canManage} />
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
            aria-label={lang === "es" ? "Idioma" : "Language"}
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
          <details ref={mobileMenu} className="relative">
            <summary className="text-sm cursor-pointer">Menu</summary>
            <div className="absolute right-0 top-8 w-64 bg-ocean-950 p-3 rounded-lg shadow-lg max-h-[75vh] overflow-auto">
              {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? "page" : undefined}
                    onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}
                    className="block py-2 text-sm"
                  >
                    {navLabel(item, lang)}
                  </Link>
                ))}
              <ToolLinks pathname={pathname} lang={lang} canManage={canManage} onNavigate={() => mobileMenu.current?.removeAttribute("open")} />
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
          {pathname === "/today" && <nav aria-label={lang === "es" ? "Vista del entrenamiento de hoy" : "Today's training display"} className="mb-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-slate-700">{lang === "es" ? "Vista de hoy:" : "Today display:"}</span>
            <span aria-current="page" className="rounded-full bg-ocean-100 px-3 py-1 text-ocean-800">{lang === "es" ? "Completa" : "Full"}</span>
            <Link href="/daily" className="rounded-full border border-slate-300 px-3 py-1 text-ocean-700 hover:bg-ocean-50" onClick={event => {
              const sessionId = new URLSearchParams(window.location.search).get("sessionId");
              if (sessionId) { event.preventDefault(); window.location.assign(`/daily?sessionId=${encodeURIComponent(sessionId)}`); }
            }}>{lang === "es" ? "Tarjeta del entrenamiento" : "Workout card"}</Link>
          </nav>}
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
    <nav aria-label={lang === "es" ? "Navegación principal" : "Main navigation"} className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-sand-200 flex justify-around py-2">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-xs ${active ? "text-ocean-700 font-semibold" : "text-slate-600"}`}
          >
            <Icon className="w-5 h-5" />
            {navLabel(item, lang)}
          </Link>
        );
      })}
    </nav>
  );
}
