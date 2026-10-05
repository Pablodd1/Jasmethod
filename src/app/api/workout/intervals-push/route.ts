import { NextResponse } from "next/server";
import { trainingAccess, errorResponse } from "@/lib/access";
import { SessionResolutionError } from "@/lib/canonical-session";
import { publishIntervalsWorkout } from "@/lib/intervals-delivery";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { athlete, actor } = await trainingAccess(req);
    const body = await req.json();
    if (!body || typeof body.sessionId !== "string" || typeof body.expectedRevision !== "string" || (body.action != null && !["publish", "cancel"].includes(body.action))) return NextResponse.json({ error: "Provide a session ID, current revision and publish or cancel action." }, { status: 400 });
    const result = await publishIntervalsWorkout({ athleteId: athlete.id, actorId: actor.id, sessionId: body.sessionId, expectedRevision: body.expectedRevision, action: body.action });
    return NextResponse.json(result, { status: result.status === "busy" ? 409 : result.status === "unknown" ? 502 : result.status === "rejected" ? 422 : 200 });
  } catch (error) {
    if (error instanceof SessionResolutionError || (error instanceof Error && "status" in error && [400,401,403,409,422,429,503].includes(Number(error.status)))) return NextResponse.json({ error: error.message }, { status: Number((error as any).status) });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request JSON." }, { status: 400 });
    return errorResponse(error);
  }
}
