"use client";

import { useEffect, useId, useState } from "react";

const providers = [
  { id: "google", label: "Google" },
  { id: "apple", label: "Apple" },
  { id: "chatgpt", label: "ChatGPT" },
] as const;
type ProviderId = (typeof providers)[number]["id"];

const errorMessages: Record<string, string> = {
  not_configured: "This sign-in option isn't available yet. Please use another option or email and password.",
  cancelled: "Sign-in was cancelled. You can try again or choose another option.",
  invalid_state: "Your sign-in session expired or could not be verified. Please start again.",
  verification_failed: "We couldn't verify your sign-in. Please try again or use email and password.",
  email_required: "We need a verified email address to create your account. Please allow email sharing or use email and password.",
  account_link_required: "This email already belongs to a JMM account. Sign in with your JMM email and password first, then link this provider. If your password no longer works, use Forgot password to keep your existing training data.",
  server_error: "Sign-in is temporarily unavailable. Please try again or use email and password.",
};

export function SocialSignIn({ intent = "login" }: { intent?: "login" | "signup" | "link" }) {
  const [available, setAvailable] = useState<ProviderId[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const linkMode = intent === "link";
  const statusId = useId();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const knownProvider = providers.some((p) => p.id === params.get("provider"));
    let code = knownProvider ? params.get("error") : null;
    // Keep old Google callback links useful without displaying raw provider errors.
    if (params.get("google") === "not-configured") code = "not_configured";
    else if (params.get("google") === "error") {
      code = params.get("reason") === "access_denied" ? "cancelled" : "verification_failed";
    }
    if (code) setNotice(errorMessages[code] || errorMessages.verification_failed);

    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch("/api/auth/providers", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Provider availability unavailable");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("providers" in data) || !Array.isArray(data.providers)) {
          throw new Error("Invalid provider availability");
        }
        const rows = data.providers;
        if (active) setAvailable(providers.filter((p) => rows.some((row: unknown) =>
          !!row && typeof row === "object" && "id" in row && "available" in row &&
          row.id === p.id && row.available === true,
        )).map((p) => p.id));
      })
      .catch(() => { if (active) setFailed(true); })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, []);

  const buttonClass = "flex w-full items-center justify-center rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900";
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-ink-500">
        <span className="h-px flex-1 bg-ink-200" /> {linkMode ? "Add a sign-in option" : "or"} <span className="h-px flex-1 bg-ink-200" />
      </div>
      <div className="mt-3 space-y-2" aria-label="Other sign-in options">
        {providers.filter(provider => available.includes(provider.id)).map(provider => (
          <a key={provider.id} href={`/api/auth/${provider.id}${linkMode ? "?link=1" : ""}`} className={`${buttonClass} hover:bg-paper-100`}>
            {linkMode ? "Link" : intent === "signup" ? "Create free account with" : "Continue with"} {provider.label}
          </a>
        ))}
      </div>
      <p id={statusId} role="status" className="mt-2 min-h-10 text-xs text-ink-600">
        {loading ? "Checking sign-in options…" : failed
          ? "We couldn't load other sign-in options. You can still use email and password."
          : available.length === 0
            ? "Social sign-in is unavailable right now. You can use email and password."
            : linkMode ? "Choose a provider to link to the account shown above. Check that the Google account you select is yours." : intent === "signup" ? "A new account starts with athlete setup. Already have JMM data? Sign in to that account first, then link Google." : "Google can sign you in or create a new account. If your email already has JMM data, sign in with your existing method first and link Google."}
      </p>
      {notice && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}
    </div>
  );
}
