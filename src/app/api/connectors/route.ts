import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stravaAuthUrl } from "@/lib/importers";

// GET /api/connectors — list connector status + Strava auth URL if configured
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connectors = await prisma.connector.findMany({ where: { userId: user.id } });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const stravaConfigured = Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
  const stravaUrl = stravaConfigured
    ? stravaAuthUrl({
        clientId: process.env.STRAVA_CLIENT_ID!,
        clientSecret: process.env.STRAVA_CLIENT_SECRET!,
        redirectUri: `${baseUrl}/api/connectors/strava/callback`,
      })
    : null;

  // Provider metadata for the UI
  const providers = [
    { id: "strava", name: "Strava", description: "Pull all activities & previous records", status: connectors.find((c) => c.provider === "strava")?.status || "disconnected", configured: stravaConfigured, connectUrl: stravaUrl },
    { id: "garmin", name: "Garmin", description: "Upload .TCX exports (Connect → Activities → Export)", status: connectors.find((c) => c.provider === "garmin")?.status || "disconnected", configured: true, method: "upload" },
    { id: "apple", name: "Apple Health", description: "Upload export.zip → export.xml", status: connectors.find((c) => c.provider === "apple")?.status || "disconnected", configured: true, method: "upload" },
    { id: "whoop", name: "Whoop", description: "Upload cycle CSV export (recovery, HRV, sleep)", status: connectors.find((c) => c.provider === "whoop")?.status || "disconnected", configured: true, method: "upload" },
    { id: "oura", name: "Oura / Aura Ring", description: "Oura Cloud API — add OURA_CLIENT_ID/SECRET to enable OAuth", status: connectors.find((c) => c.provider === "oura")?.status || "disconnected", configured: Boolean(process.env.OURA_CLIENT_ID), method: "api" },
  ];

  return NextResponse.json({ providers, connectors });
}
