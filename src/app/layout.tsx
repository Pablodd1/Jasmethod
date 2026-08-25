import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { AuthProvider } from "@/components/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "JasMiamiMethod — Science-Backed Triathlon Coaching",
  description: "Personalized triathlon training based on post-2000 sports medicine research. Daily training, sleep, recovery, HRV, blood panels, DNA, nutrition, hydration and periodized race plans.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
