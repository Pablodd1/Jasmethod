import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { isDerivedActivityEligible } from "./derived-activity-policy";
import { sportEvidence,sportRowRevision,SPORT_RECORD_SELECT } from "./sport-evidence";
import { recoverLatestGarmin } from "./sport-evidence-store";
import { dateKey } from "./dates";
import { readActivityDecisions } from "./activity-reconciliation";

/** Append the one missing quantity, preserving provider fields and their original source. */
export async function sportDistanceSupplement(user:{id:string;timezone:string},body:Record<string,unknown>) {
  if(Object.keys(body).some(k=>!["mode","workoutId","expectedRevision","requestId","distance","distanceUnit","previewToken","confirmed"].includes(k))||
    typeof body.workoutId!=="string"||body.workoutId.length>128||typeof body.expectedRevision!=="string"||
    typeof body.requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.requestId))throw new ApiError("Invalid existing-activity review.");
  const externalRequest="distance-supplement:"+body.requestId;
  const build=async(db:Pick<typeof prisma,"workout"|"connector"|"syncJob"|"auditLog">)=>{
    const row=await db.workout.findFirst({where:{id:body.workoutId as string,userId:user.id},select:SPORT_RECORD_SELECT});
    if(!row)throw new ApiError("Activity not found.",404);
    if(sportRowRevision(row)!==body.expectedRevision)throw new ApiError("This activity changed. Reload its measurements.",409);
    if(!isDerivedActivityEligible(row))throw new ApiError("This source cannot be used for derived sport calculations.",422);
    const sport=row.actualSport||row.sport;
    if(!["bike","swim","run"].includes(sport))throw new ApiError("Choose a swim, bike or run activity.");
    let root:Record<string,any>={schemaVersion:1,values:{}};
    if(row.actualDetails){try {root=JSON.parse(row.actualDetails);}catch{throw new ApiError("The existing annotations need review.",422);}
      if(!root||root.schemaVersion!==1||Array.isArray(root)||!root.values||typeof root.values!=="object"||Array.isArray(root.values))throw new ApiError("The existing annotations need review.",422);}
    if(row.distanceKm!=null||root.values?.distanceKm!=null)throw new ApiError("Distance is already recorded. Review that original observation.",409);
    const factors:Record<string,number>={km:1,mi:1.609344,m:.001,yd:.0009144};
    if(typeof body.distanceUnit!=="string"||!Object.hasOwn(factors,body.distanceUnit)||(sport!=="swim"&&!["km","mi"].includes(body.distanceUnit))||
      !["number","string"].includes(typeof body.distance)||!/^\d+(?:\.\d+)?$/.test(String(body.distance)))throw new ApiError("Enter the missing distance and its units.");
    const distanceKm=Number(body.distance)*factors[body.distanceUnit];
    if(!Number.isFinite(distanceKm)||distanceKm<=0||distanceKm>1500)throw new ApiError("Check the missing distance and units.");
    const [connection,related,decisions]=await Promise.all([
      db.connector.findFirst({where:{userId:user.id,provider:"garmin_direct"},select:{status:true,scope:true,externalRef:true}}),
      db.workout.findMany({where:{userId:user.id,date:{gte:new Date(row.date.getTime()-60000),lte:new Date(row.date.getTime()+60000)},OR:[{completed:true},{actualDurationMin:{not:null}}]},take:101,select:SPORT_RECORD_SELECT}),
      readActivityDecisions(user.id,db),
    ]);
    if(related.length>100)throw new ApiError("Review activity identity before calculating this record.",422);
    const recovered=await recoverLatestGarmin([row],user.id,connection,db);
    const view=sportEvidence(related.map(r=>r.id===row.id?recovered[0]:r),user.id,decisions,new Date()).find(s=>s.sport===sport)?.records.find(r=>r.id===row.id);
    if(!view||!view.derivedAllowed||view.durationSeconds<=0)throw new ApiError("Review the source, actual duration or possible copies first.",422);
    const preview={id:row.id,sport,date:view.observedAt,source:row.source,distanceKm,durationSeconds:view.durationSeconds,precision:view.precision,durationBasis:view.durationBasis,averageSpeedKmh:distanceKm*3600/view.durationSeconds};
    const token=createHash("sha256").update(JSON.stringify({userId:user.id,request:externalRequest,revision:body.expectedRevision,preview})).digest("hex");
    return {row,root,preview,token,distanceKm};
  };
  if(body.mode==="preview-distance"){const p=await build(prisma);return {ok:true,state:"proposed",preview:p.preview,previewToken:p.token};}
  if(body.mode!=="save-distance"||body.confirmed!==true||typeof body.previewToken!=="string")throw new ApiError("Confirm the missing-distance review.");
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
    const prior=await tx.auditLog.findFirst({where:{actorId:user.id,subjectId:user.id,action:"activity.distance-supplement",note:externalRequest},select:{entityId:true,after:true}});
    if(prior){let old;try{old=JSON.parse(prior.after||"null");}catch{throw new ApiError("The saved receipt needs review.",409);}
      if(old?.previewToken!==body.previewToken||old?.requestDistance!==body.distance||old?.requestUnit!==body.distanceUnit||prior.entityId!==body.workoutId)throw new ApiError("This request already saved other information.",409);
      const current=prior.entityId?await tx.workout.findFirst({where:{id:prior.entityId,userId:user.id},select:{actualDetails:true}}):null;
      let details;try{details=JSON.parse(current?.actualDetails||"null");}catch{}
      if(details?.manualDistanceEvidence?.distanceKm!==old?.preview?.distanceKm)throw new ApiError("That saved annotation changed. Reload the activity.",409);
      return {ok:true,state:"saved",workoutId:prior.entityId,duplicate:true};}
    const p=await build(tx);
    if(p.token!==body.previewToken)throw new ApiError("The source measurement changed. Review the calculation again.",409);
    const now=new Date().toISOString(),details={...p.root,source:"athlete_report",observedDate:dateKey(p.row.date,user.timezone),enteredAt:now,values:{...p.root.values,distanceKm:p.distanceKm},
      manualDistanceEvidence:{version:1,source:"athlete_report",distanceKm:p.distanceKm,enteredAt:now}};
    const written=await tx.workout.updateMany({where:{...p.row,userId:user.id},data:{actualDetails:JSON.stringify(details)}});
    if(written.count!==1)throw new ApiError("The activity changed while saving. Reload it.",409);
    await tx.auditLog.create({data:{actorId:user.id,subjectId:user.id,action:"activity.distance-supplement",entityId:p.row.id,note:externalRequest,
      after:JSON.stringify({previewToken:p.token,requestDistance:body.distance,requestUnit:body.distanceUnit,preview:p.preview})}});
    return {ok:true,state:"saved",workoutId:p.row.id,duplicate:false};
  },{timeout:15000});
}
