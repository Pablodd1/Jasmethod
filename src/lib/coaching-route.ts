import { getCurrentUser } from "./auth";
import { ApiError, errorResponse } from "./access";
import { rateLimit } from "./ratelimit";
import { record } from "./coaching-communication";
export async function coachingActor(req?: Request) {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("Sign in to continue", 401);
  // Only athletes themselves can authorize communications or consume replies.
  const target = req ? new URL(req.url).searchParams.get("athleteId") : null;
  if (target && target !== user.id) throw new ApiError("Only the athlete can manage their communications", 403);
  return user;
}
export async function coachingBody(req: Request) {
  const actor = await coachingActor(req);
  if (!rateLimit(`coaching:${actor.id}`, 30, 60_000).ok) throw new ApiError("Please wait before trying again", 429);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 8192) throw new ApiError("Request too large", 413);
  const text = await req.text();
  if (text.length > 8192) throw new ApiError("Request too large", 413);
  try { return { actor, body: record(JSON.parse(text)) }; } catch { throw new ApiError("Invalid JSON body"); }
}
export function coachingError(e: unknown) {
  if (e && typeof e === "object" && "code" in e) {
    if (e.code === "P2034") return errorResponse(new ApiError("Another update won the race. Reload; no duplicate action was applied.", 409));
    if (e.code === "P2002") return errorResponse(new ApiError("This chat or prompt is already linked. Reload before retrying.", 409));
  }
  return errorResponse(e);
}
