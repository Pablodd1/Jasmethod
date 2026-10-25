import { getCurrentUser } from "@/lib/auth";
import { ApiError, errorResponse } from "@/lib/access";
import { readConversationBody } from "@/lib/coach-conversation-service";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { rateLimit } from "@/lib/ratelimit";
import { analyzeFoodPhoto, requireFoodPhotoConsent } from "@/lib/nutrition-photo";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function POST(req:Request) {
  try {
    const user=await getCurrentUser();if(!user)throw new ApiError("Unauthorized",401);
    if(!appMutationOriginAllowed(req))throw new ApiError("Use photo analysis from this application",403);
    if(!rateLimit(`food-photo:${user.id}`,6,60000).ok)throw new ApiError("Please wait before another photo",429);
    const body=await readConversationBody(req,3*1024*1024);
    try{requireFoodPhotoConsent(body);}catch(error){throw new ApiError((error as Error).message,403);}
    try{return Response.json(await analyzeFoodPhoto(body,user.language||"en",{key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL}),{headers});}
    catch{return Response.json({error:"Photo analysis could not be completed. Review the file and consent, or enter the meal manually."},{status:422,headers});}
  }catch(error){const response=errorResponse(error);response.headers.set("Cache-Control","private, no-store");return response;}
}
