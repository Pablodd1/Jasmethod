import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deleteAllStreams, deleteStreams, prismaStreamRepo, retentionDays, streamStorageEnabled, type StreamDelegate } from "@/lib/activity-stream-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };
const repo = () => prismaStreamRepo((prisma as unknown as { activityStream: StreamDelegate }).activityStream);

/** GET → whether second-by-second storage is available, its retention, and which of MY activities have stored data. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const enabled = streamStorageEnabled();
  if (!enabled) return NextResponse.json({ enabled, retentionDays: null, workoutIds: [] }, { headers: NO_STORE });
  try {
    return NextResponse.json({ enabled, retentionDays: retentionDays(), workoutIds: await repo().listWorkoutIds(user.id, new Date()) }, { headers: NO_STORE });
  } catch (error) {
    console.error("activity stream status failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ enabled, retentionDays: retentionDays(), workoutIds: [], unavailable: true }, { headers: NO_STORE });
  }
}

/** DELETE ?workoutId=… removes one activity's stored data; DELETE ?all=1 removes all of mine. Deleting is always allowed, even when storage is switched off. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(req.url).searchParams;
  try {
    if (query.get("all") === "1") return NextResponse.json({ deleted: await deleteAllStreams(repo(), user.id) }, { headers: NO_STORE });
    const workoutId = query.get("workoutId");
    if (!workoutId || workoutId.length > 200) return NextResponse.json({ error: "Select an activity." }, { status: 400 });
    return NextResponse.json({ deleted: await deleteStreams(repo(), user.id, workoutId) }, { headers: NO_STORE });
  } catch (error) {
    console.error("activity stream delete failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Could not delete. Please retry." }, { status: 500 });
  }
}
