"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, properties?: Record<string, unknown>) => void;
      identify?: (id: string, properties?: Record<string, unknown>) => void;
      getFeatureFlag?: (key: string) => unknown;
    };
    gtag?: (...args: unknown[]) => void;
    jmmTrack?: (event: string, properties?: Record<string, unknown>) => void;
  }
}

/**
 * Lightweight analytics, A/B feature flags, and post-workout micro-survey hook
 * powered by PostHog Cloud/OSS (replaces separate GrowthBook + Formbricks servers).
 */
export function PostHogAnalytics() {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() || "";
  const posthogHost =
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim() || "";

  useEffect(() => {
    window.jmmTrack = (event: string, properties?: Record<string, unknown>) => {
      try {
        if (window.posthog && typeof window.posthog.capture === "function") {
          window.posthog.capture(event, properties);
        }
        if (window.gtag && typeof window.gtag === "function") {
          window.gtag("event", event, properties || {});
        }
      } catch {
        // Non-blocking telemetry
      }
    };
  }, []);

  const validPosthogKey = /^phc_[A-Za-z0-9_]+$/.test(posthogKey)
    ? posthogKey
    : "";
  const validGaId = /^G-[A-Z0-9]+$/i.test(gaId) ? gaId : "";

  return (
    <>
      {validPosthogKey && (
        <Script id="jmm-posthog-init" strategy="afterInteractive">
          {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_in_capturing opt_out_capturing has_opted_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures onFeatureFlags onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(validPosthogKey)}, {
  api_host: ${JSON.stringify(posthogHost)},
  person_profiles: "identified_only",
  capture_pageview: true,
  capture_pageleave: true
});`}
        </Script>
      )}

      {validGaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${validGaId}`}
            strategy="afterInteractive"
          />
          <Script id="jmm-ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(validGaId)},{anonymize_ip:true});`}
          </Script>
        </>
      )}
    </>
  );
}
