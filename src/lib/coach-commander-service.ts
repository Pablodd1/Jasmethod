import { prisma } from "./db";
import { ApiError } from "./access";
import { readPlanningSetup } from "./planning-setup-store";
import { assessPlanningSetup, planningGoal } from "./planning-setup";
import { dateKey } from "./dates";
import { commanderReceipt } from "./coach-commander";
import type { ConversationActor } from "./coach-conversation-service";
import { commanderRequestHash } from "./coach-commander-provenance";
export { commanderRequestHash } from "./coach-commander-provenance";

const headers = { "Cache-Control": "private, no-store" };
const id = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export async function getCommanderState(actor: ConversationActor) {
  const [profile, setup, plans, audits] = await Promise.all([
    prisma.athleteProfile.findUnique({where:{userId:actor.id}}), readPlanningSetup(actor.id),
    prisma.trainingPlan.findMany({where:{userId:actor.id,status:"active"},orderBy:{createdAt:"desc"},select:{id:true,name:true,easyPct:true}}),
    prisma.auditLog.findMany({where:{subjectId:actor.id,actorId:actor.id,action:"plan.generate",after:{contains:'"origin":"private_coach"'}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:10,select:{id:true,entityId:true,after:true,createdAt:true}}),
  ]);
  return {ok:true,localToday:dateKey(new Date(),actor.timezone), readiness:assessPlanningSetup(profile,setup.setup),
    defaults:{distance:planningGoal(profile?.goal),weeks:setup.setup?.planWeeks??null,easyPct:plans[0]?.easyPct??null,trainingWindow:profile?.trainingWindow??null},
    activePlans:plans,receipt:audits.map(commanderReceipt).find(Boolean)??null};
}

/** Owner-only route reuses the existing planner, its input evidence and serializable save. */
export async function commanderPlan(req: Request, actor: ConversationActor, raw: Record<string, unknown>, generate: (request: Request) => Promise<Response>) {
  const allowed = ["action","weeks","startDate","easyPct","trainingWindow","previewToken","confirmDoubleDay","confirmEventTradeoffs","sourceMessageId"];
  if (Object.keys(raw).some(key => !allowed.includes(key)) || !["preview","confirm"].includes(String(raw.action))) throw new ApiError("Choose preview or explicit plan confirmation");
  if (typeof raw.weeks!=="number" || !Number.isInteger(raw.weeks) || raw.weeks<4 || raw.weeks>30 || typeof raw.startDate!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) || !Number.isFinite(Date.parse(raw.startDate+"T12:00:00Z")) || new Date(raw.startDate+"T12:00:00Z").toISOString().slice(0,10)!==raw.startDate) throw new ApiError("Review planning weeks and start date");
  if (raw.easyPct!==undefined && (typeof raw.easyPct!=="number" || !Number.isFinite(raw.easyPct) || raw.easyPct<45 || raw.easyPct>90)) throw new ApiError("Review the planned easy allocation");
  if (raw.trainingWindow!==undefined && !["any","morning","midday","evening"].includes(String(raw.trainingWindow))) throw new ApiError("Review your training window");
  for (const field of ["confirmDoubleDay","confirmEventTradeoffs"]) if (raw[field]!==undefined && typeof raw[field]!=="boolean") throw new ApiError("Explicit agreement must be true or false");
  if (raw.sourceMessageId!==undefined && raw.sourceMessageId!==null) {
    if (!id(raw.sourceMessageId)) throw new ApiError("Invalid source message");
    const source=await prisma.coachConversationMessage.findFirst({where:{id:raw.sourceMessageId as string,userId:actor.id,role:"user"},select:{id:true}});
    if (!source) throw new ApiError("Source message not found",404);
  }
  if (raw.action==="confirm") {
    if (typeof raw.previewToken!=="string" || !/^[a-f0-9]{64}$/.test(raw.previewToken)) throw new ApiError("Preview the current plan before confirming",409);
    const audits=await prisma.auditLog.findMany({where:{subjectId:actor.id,actorId:actor.id,action:"plan.generate",after:{contains:raw.previewToken}},take:10,orderBy:{createdAt:"desc"},select:{id:true,entityId:true,after:true,createdAt:true}});
    const saved=audits.map(commanderReceipt).find(receipt=>receipt!==null && receipt.previewToken===raw.previewToken);
    if (saved) {
      if(saved.requestHash!==commanderRequestHash(raw))throw new ApiError("This saved preview belongs to different reviewed inputs. Reload the current plan.",409);
      return Response.json({ok:true,replayed:true,receipt:saved}, {headers});
    }
  }
  const {action,sourceMessageId,...fields}=raw;
  const body={...fields,preview:action==="preview",commanderContext:{origin:"private_coach",sourceMessageId:sourceMessageId??null,requestHash:commanderRequestHash(raw)}};
  const response=await generate(new Request(req.url,{method:"POST",headers:req.headers,body:JSON.stringify(body)}));
  if (!response.ok || action==="preview") return response;
  const audits=await prisma.auditLog.findMany({where:{subjectId:actor.id,actorId:actor.id,action:"plan.generate",after:{contains:raw.previewToken as string}},take:10,orderBy:{createdAt:"desc"},select:{id:true,entityId:true,after:true,createdAt:true}});
  const receipt=audits.map(commanderReceipt).find(row=>row?.previewToken===raw.previewToken&&row?.requestHash===commanderRequestHash(raw));
  if (!receipt) return Response.json({ok:false,error:"The planner returned, but its save receipt could not be verified. Reload the saved plan before retrying.",saveUnconfirmed:true},{status:409,headers});
  return Response.json({ok:true,receipt},{headers});
}
