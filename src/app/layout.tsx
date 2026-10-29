import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import "./globals.css";
import { WebApp } from "@/components/web-app";
import { headers } from "next/headers";

const inter = Inter({ subsets: ["latin"], variable: "--font-body", display:"swap" });
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
  title: "Jas Miami Method | Training, fueling and recovery",
  description:
    "Review training, food and fluids around your session, recovery choices and completed work. Manual tools remain available without a wearable.",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "JasMiamiMethod",
    title: "Jas Miami Method | Training, fueling and recovery",
    description:
      "Review your session, record what happened and prepare your next step. Devices and sensitive uploads are optional.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jas Miami Method | Training, fueling and recovery",
    description:
      "Review your session, record what happened and prepare your next step. Devices and sensitive uploads are optional.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const publicLanguage=(await headers()).get("x-jmm-public-locale");
  const initialPublicLanguage=publicLanguage==="es"||publicLanguage==="en"?publicLanguage:undefined;
  return (
    <html
      lang={initialPublicLanguage||"en"}
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable}`}
    >
      <body>
        <AuthProvider publicLanguage={initialPublicLanguage}>
          <WebApp />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
