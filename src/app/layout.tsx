import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JasMiamiMethod — Science-Backed Triathlon Coaching",
  description:
    "Personalized triathlon, HYROX and endurance coaching built on post-2000 human-performance research. Daily check-in, HRV recovery, sleep, blood panels, DNA, nutrition, hydration and periodized race plans.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${plexMono.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
