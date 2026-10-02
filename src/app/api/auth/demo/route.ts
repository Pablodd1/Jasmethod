import { NextResponse } from "next/server";

// Retired permanently: no environment flag may re-enable shared-account access.
// Keep the route inert for stale clients without reading a body, users, or sessions.
export async function GET() {
  return NextResponse.json({ enabled: false }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  return NextResponse.json(
    { error: "Shared demo login is unavailable. Sign in with your own account." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
