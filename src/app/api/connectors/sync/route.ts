import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncUserConnectors } from "@/lib/sync";

// POST /api/connectors/sync — re-pull data from the athlete's connected providers.
// Body (optional): { provider: "garmin" | "strava" | ... } to sync ONE device
// (used by the progress bar, which syncs devices one at a time). Incremental:
// only fetches records since lastSyncAt (or 30 days if never).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let onlyProvider: string | undefined;
  try {
    const body = await req.json();
    if (body?.provider) onlyProvider = String(body.provider);
  } catch { /* no body = sync everything */ }

  const { results, total } = await syncUserConnectors(user.id, onlyProvider);
  const failed = results.filter((r) => !r.ok).length;
  const message = results.length === 0
    ? "No connected devices. Connect Strava, Garmin, or Google Calendar first."
    : failed > 0
      ? `Synced ${total} new record${total === 1 ? "" : "s"}, but ${failed} device${failed === 1 ? "" : "s"} failed — the owner has been notified.`
      : `Synced ${total} new record${total === 1 ? "" : "s"} from ${results.length} device${results.length === 1 ? "" : "s"}.`;

  return NextResponse.json({ synced: results, total, failed, message });
}
