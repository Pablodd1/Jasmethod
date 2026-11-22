import type { Metadata } from "next";
import Script from "next/script";
import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import "./globals.css";
import { WebApp } from "@/components/web-app";
import { PostHogAnalytics } from "@/components/posthog-analytics";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = "https://jasmiamimethod.fit";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  title: "JasMiamiMethod — Science-Backed Coaching for Triathlon, Running, HYROX, Boxing & Track",
  description:
    "Personalized daily coaching for triathlon, running, cycling, HYROX, boxing and track sprinters — built on post-2000 human-performance research. Daily check-in, HRV recovery, sleep, fueling and hydration plans, blood panels, and periodized race plans. Works with or without wearables.",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "JasMiamiMethod",
    title: "JasMiamiMethod — Training that reads your body, not your ego",
    description:
      "Daily adaptive coaching for triathlon, running, HYROX, boxing and track. Science-backed, works with or without wearables.",
  },
  twitter: {
    card: "summary_large_image",
    title: "JasMiamiMethod — Data, not ego.",
    description:
      "Daily adaptive coaching for triathlon, running, HYROX, boxing and track. Science-backed, works with or without wearables.",
  },
};

const jmmJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SportsActivityLocation",
      "@id": `${SITE_URL}/#organization`,
      name: "JasMiamiMethod (JMM)",
      url: SITE_URL,
      founder: {
        "@type": "Person",
        name: "Jasmel Acosta",
      },
      address: {
        "@type": "PostalAddress",
        addressLocality: "Miami Beach",
        addressRegion: "FL",
        addressCountry: "US",
      },
      areaServed: ["Miami Beach", "Key Biscayne", "Miami", "Worldwide Remote"],
      description:
        "Science-backed daily coaching for triathlon, running, cycling, HYROX, boxing and track sprinters with wearable telemetry sync.",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "JasMiamiMethod Training Platform",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description:
        "Adaptive daily readiness, HRV recovery, fueling, hydration, and periodized race planning synced with Garmin Connect, Intervals.icu, Strava, WHOOP, and Zwift.",
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What sports does JasMiamiMethod coach?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "JasMiamiMethod provides adaptive daily coaching for triathlon (Sprint through Ironman 140.6), marathon and half-marathon running, cycling, HYROX hybrid racing, boxing conditioning, and track sprints in Miami and remotely worldwide.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need a GPS watch or wearable to use JasMiamiMethod?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. JasMiamiMethod adapts workouts from daily biometric check-ins even without wearables, and integrates seamlessly with Garmin Connect, Intervals.icu, Strava, WHOOP, Zwift (.ZWO), Apple Watch, and COROS when available.",
          },
        },
        {
          "@type": "Question",
          name: "How does daily training adaptation work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Each morning, readiness markers including HRV, resting heart rate, sleep quality, soreness, and cumulative training load calibrate your session intensity, fueling, and hydration targets before you train.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable}`}
    >
      <head>
        <link
          rel="help"
          type="text/plain"
          href="/llms.txt"
          title="JasMiamiMethod LLM Knowledge Index"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jmmJsonLd) }}
        />
      </head>
      <body>
        <AuthProvider>
          <WebApp />
          {children}
        </AuthProvider>
        <PostHogAnalytics />
        <Script
          src="https://www.aidynamic.pro/ecosystem-widget.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
