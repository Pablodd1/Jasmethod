import {createHash} from 'node:crypto';
import {prisma} from './db';
import {RACE_SCENARIO_VERSION} from './race-scenario';
import {buildRaceScenarioAnchors} from './race-scenario-evidence';
export const RACE_SCENARIO_ACTION='race.scenario';
type ScenarioDb=Pick<typeof prisma,'race'|'benchmarkTest'|'athleteProfile'|'auditLog'>;
export function scenarioRevision(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export async function readRaceScenarioState(athleteId:string,db:ScenarioDb=prisma){
 const [races,tests,profile,audits]=await Promise.all([
  db.race.findMany({where:{userId:athleteId},orderBy:[{date:'asc'},{id:'asc'}],select:{id:true,name:true,date:true,startTime:true,location:true,lat:true,lng:true,distance:true,courseKm:true,courseElevM:true,targetTempC:true,humidity:true,baseElevM:true}}),
  db.benchmarkTest.findMany({where:{userId:athleteId,completed:true},orderBy:[{date:'desc'},{id:'asc'}]}),
  db.athleteProfile.findUnique({where:{userId:athleteId},select:{ftp:true,runPaceBase:true,swimPaceBase:true,lthr:true,weightKg:true,hasRunPowerMeter:true,hasBikePowerMeter:true}}),
  db.auditLog.findMany({where:{subjectId:athleteId,action:RACE_SCENARIO_ACTION},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50,select:{id:true,createdAt:true,after:true}})
 ]);
 const evidenceRevision=scenarioRevision({races,tests,profile});
 const anchors=buildRaceScenarioAnchors(tests,profile);
 let unreadableSnapshots=0;
 const now=Date.now();
 const expired=(input:{legs?:{baseline?:{observedAt?:string}|null;intensityEvidence?:{observedAt?:string}|null}[];fuelEvidence?:{observedAt?:string}|null;weather?:{kind?:string;validTo?:string|null}})=>{const references=[...(input.legs??[]).flatMap(l=>[l.baseline,l.intensityEvidence]),input.fuelEvidence].filter(Boolean);return references.some(e=>!e?.observedAt||!Number.isFinite(Date.parse(e.observedAt))||now-Date.parse(e.observedAt)>90*86400000)||(input.weather?.kind==='forecast'&&(!input.weather.validTo||Date.parse(input.weather.validTo)<now));};
 const snapshots=audits.flatMap(a=>{try{const data=JSON.parse(a.after??'null');if(data?.version!=='race-scenario-snapshot-v1'||!data.input||!data.result||typeof data.modelVersion!=='string')throw Error();return [{id:a.id,createdAt:a.createdAt.toISOString(),input:data.input,metadata:data.metadata??null,result:data.result,modelVersion:data.modelVersion,evidenceRevision:data.evidenceRevision,stale:data.evidenceRevision!==evidenceRevision||data.modelVersion!==RACE_SCENARIO_VERSION||expired(data.input)}];}catch{unreadableSnapshots++;return [];}});
 return {revision:scenarioRevision({evidenceRevision,audits}),evidenceRevision,races,anchors,profileContext:{weightKg:profile?.weightKg??null,hasRunPowerMeter:profile?.hasRunPowerMeter??false,hasBikePowerMeter:profile?.hasBikePowerMeter??false},snapshots,unreadableSnapshots,limitations:['The 90-day anchor review window is an implementation policy, not validation of race capacity.','Saved scenarios are immutable assumptions and calculations, not predictions or prescriptions.','Only the latest 50 scenario snapshots are listed.']};
}
