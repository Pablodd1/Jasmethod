import { getCurrentUser } from '@/lib/auth';
import { ApiError,errorResponse } from '@/lib/access';
import { prisma } from '@/lib/db';
import { COACH_REVIEW_PREFIX,coachReviewScope } from '@/lib/coach-review';
export const dynamic='force-dynamic';
export async function GET() {
  try {
    const actor=await getCurrentUser();if(!actor)throw new ApiError('Sign in',401);
    const scope=await coachReviewScope(actor);
    const requests=await prisma.coachingMessage.findMany({where:{...scope,clientId:{startsWith:COACH_REVIEW_PREFIX}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50,select:{id:true,athleteId:true,body:true,createdAt:true,athlete:{select:{name:true}}}});
    return Response.json({ok:true,requests},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return errorResponse(error);}
}
