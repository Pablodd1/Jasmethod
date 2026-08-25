"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, CalendarDays, Dumbbell, HeartPulse, Moon, Droplets, Apple,
  FlaskConical, Dna, Plug, Settings, Waves, LogOut, LineChart,
} from "lucide-react";
import { useAuth } from "./auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/training", label: "Training Plan", icon: Dumbbell },
  { href: "/labs", label: "Field-Test Labs", icon: FlaskConical },
  { href: "/metrics", label: "HRV & Recovery", icon: HeartPulse },
  { href: "/sleep", label: "Sleep", icon: Moon },
  { href: "/nutrition", label: "Nutrition & Hydration", icon: Apple },
  { href: "/blood", label: "Blood Panels", icon: FlaskConical },
  { href: "/dna", label: "DNA Analysis", icon: Dna },
  { href: "/connectors", label: "Connectors", icon: Plug },
  { href: "/settings", label: "Profile & Zones", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-60 flex-col bg-ocean-950 text-white fixed inset-y-0 left-0 z-20">
        <div className="px-5 py-6 border-b border-ocean-900">
          <div className="flex items-center gap-2">
            <Waves className="w-7 h-7 text-ocean-300" />
            <div>
              <div className="font-display font-bold text-lg leading-tight">JasMiamiMethod</div>
              <div className="text-[10px] text-ocean-400 uppercase tracking-widest">Science-Backed Triathlon</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active ? "bg-ocean-600 text-white" : "text-ocean-300 hover:bg-ocean-900 hover:text-white"
                }`}
              >
                <Icon className="w-4.5 h-4.5 w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-ocean-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-ocean-600 flex items-center justify-center font-bold">
              {user?.name?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name || "Athlete"}</div>
              <div className="text-[11px] text-ocean-400 truncate">{user?.email || ""}</div>
            </div>
            <button onClick={() => logout()} title="Log out" className="text-ocean-400 hover:text-white">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-ocean-950 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves className="w-6 h-6 text-ocean-300" />
          <span className="font-display font-bold">JasMiamiMethod</span>
        </div>
        <button onClick={() => logout()} className="text-ocean-300 text-sm">Log out</button>
      </div>

      <main className="flex-1 md:ml-60 pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-sand-200 flex justify-around py-2">
      {NAV.slice(0, 5).map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? "text-ocean-600" : "text-slate-400"}`}>
            <Icon className="w-5 h-5" />
            {item.label.split(" ")[0]}
          </Link>
        );
      })}
    </div>
  );
}
