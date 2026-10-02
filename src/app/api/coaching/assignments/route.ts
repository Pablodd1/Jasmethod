import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { errorResponse, ApiError } from "@/lib/access";
export const dynamic="force-dynamic";
export async function GET() {
 try {
  const user=await getCurrentUser(); if(!user) throw new ApiError("Sign in",401);
  const assignments=await prisma.coachAssignment.findMany({where:{athleteId:user.id},include:{coach:{select:{name:true,id:true}}}});
  return Response.json({assignments});
 }catch(e){return errorResponse(e);}
}
export async function PUT(req:Request) {
 try {
  const user=await getCurrentUser(); if(!user) throw new ApiError("Sign in",401);
  const body=await req.json();
  if(!["granted","revoked"].includes(body.consent)||typeof body.id!=="string") throw new ApiError("Choose grant or revoke");
  await prisma.$transaction(async tx=>{
   const before=await tx.coachAssignment.findFirst({where:{id:body.id,athleteId:user.id}});
   if(!before) throw new ApiError("Assignment not found",404);
   await tx.coachAssignment.update({where:{id:before.id},data:{consent:body.consent}});
   await tx.auditLog.create({data:{actorId:user.id,subjectId:user.id,action:"coach.consent",entityId:before.id,before:JSON.stringify({consent:before.consent}),after:JSON.stringify({consent:body.consent})}});
  });
  return Response.json({ok:true});
 }catch(e){return errorResponse(e);}
}
