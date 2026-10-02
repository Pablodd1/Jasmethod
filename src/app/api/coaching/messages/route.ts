import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { messageInput } from "@/lib/coaching-message";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const {athlete} = await trainingAccess(req);
    const messages = await prisma.coachingMessage.findMany({where:{athleteId:athlete.id}, orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,
      include:{author:{select:{id:true,name:true,role:true}}}});
    return Response.json({messages:messages.reverse(), limitedToLatest:100});
  } catch(e) {return errorResponse(e);}
}
export async function POST(req: Request) {
  try {
    const {actor,athlete} = await trainingAccess(req);
    let input; try {input=messageInput(await req.json());} catch(e) {throw new ApiError((e as Error).message);}
    const message = await prisma.coachingMessage.upsert({
      where:{authorId_clientId:{authorId:actor.id,clientId:input.clientId}}, update:{},
      create:{authorId:actor.id,athleteId:athlete.id,...input}});
    if(message.athleteId!==athlete.id || message.body!==input.body) throw new ApiError("Message identifier already used",409);
    return Response.json({ok:true,id:message.id});
  } catch(e) {return errorResponse(e);}
}
