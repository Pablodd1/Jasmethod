"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { clearOnboardingDrafts } from "@/lib/onboarding-form";
import { LANGS, type Lang } from "@/lib/i18n";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  language?: string;
  timezone?: string;
  avatar?: string;
  profile?: any;
  motivation?: any;
  firstRun?: boolean;
  onboarded?: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  error: boolean;
  language: Lang;
  setLanguage: (l: Lang) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  error: false,
  language: "es",
  setLanguage: async () => {},
  refresh: async () => {},
  logout: async () => {},
});

function isLang(v: unknown): v is Lang {
  return typeof v === "string" && LANGS.some((l) => l.code === v);
}

function applyLang(l: Lang) {
  try {
    localStorage.setItem("jmm_lang", l);
  } catch {}
  document.documentElement.lang = l;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [language, setLanguageState] = useState<Lang>("es");

  // Spanish default; honor a stored preference from a previous visit.
  useEffect(() => {
    let initial: Lang = "es";
    try {
      const stored = localStorage.getItem("jmm_lang");
      if (isLang(stored)) initial = stored;
    } catch {}
    setLanguageState(initial);
    applyLang(initial);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Session verification unavailable");
      const data = await res.json();
      if (!data || !("user" in data)) throw new Error("Invalid session response");
      setUser(data.user);
      try {
        if (data.user) localStorage.setItem("jmm_last_user", data.user.id);
        else {
          try { clearOnboardingDrafts(sessionStorage); } catch {}
          localStorage.removeItem("jmm_last_user");
          Object.keys(localStorage)
            .filter((k) => k.startsWith("jmm_today_"))
            .forEach((k) => localStorage.removeItem(k));
        }
      } catch {}
      // A signed-in user carries their language on the profile.
      if (data.user?.language && isLang(data.user.language)) {
        setLanguageState(data.user.language);
        applyLang(data.user.language);
      }
    } catch {
      setUser(null);
      setError(true);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setLanguage = useCallback(
    async (l: Lang) => {
      setLanguageState(l);
      applyLang(l);
      if (user) {
        await fetch("/api/language", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: l }),
        });
        await refresh();
      }
    },
    [user, refresh],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try { clearOnboardingDrafts(sessionStorage); } catch {}
    try {
      Object.keys(localStorage)
        .filter(
          (k) =>
            k.startsWith("jmm_today_") ||
            k.startsWith("jmm_checkin_") ||
            k === "jmm_last_user",
        )
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    setUser(null);
    window.location.href = "/";
  }, []);

  return (
    <Ctx.Provider
      value={{ user, loading, error, language, setLanguage, refresh, logout }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
