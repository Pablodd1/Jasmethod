import { trainingAccess, errorResponse } from "@/lib/access";
import { ensureStarterWorkout } from "@/lib/starter-session-store";
export async function POST(req:Request) {
  try {
    const {actor,athlete}=await trainingAccess(req);
    const result=await ensureStarterWorkout(athlete.id,actor.id);
    return Response.json({ok:true,...result},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) { return errorResponse(error); }
}
