import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import "./globals.css";
import { WebApp } from "@/components/web-app";

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
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  title: "JasMiamiMethod — Coaching for Swim, Bike, Run, HYROX & Triathlon",
  description:
    "Personalized daily coaching for swimming, cycling, running, HYROX and triathlon — built on post-2000 human-performance research. Daily check-in, HRV recovery, sleep, fueling and hydration plans, blood panels, and periodized race plans. Works with or without wearables.",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "JasMiamiMethod",
    title: "JasMiamiMethod — Training that reads your body, not your ego",
    description:
      "Daily adaptive coaching for swimming, cycling, running, HYROX and triathlon. Science-backed, works with or without wearables.",
  },
  twitter: {
    card: "summary_large_image",
    title: "JasMiamiMethod — Data, not ego.",
    description:
      "Daily adaptive coaching for swimming, cycling, running, HYROX and triathlon. Science-backed, works with or without wearables.",
  },
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
      <body>
        <AuthProvider>
          <WebApp />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
