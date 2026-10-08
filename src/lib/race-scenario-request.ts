import {ApiError} from './access';
import {parseRaceScenarioInput,calculateScenario} from './race-scenario';
import {parseRaceScenarioMetadata,assertScenarioTimeZone} from './race-scenario-metadata';
import type {readRaceScenarioState} from './race-scenario-store';
type State=Awaited<ReturnType<typeof readRaceScenarioState>>;
/** Resolve every claimed saved anchor against the authenticated athlete, never client IDs alone. */
export function prepareRaceScenario(body:Record<string,unknown>,state:State){
 const parsed=parseRaceScenarioInput(body.input);
 if(!parsed.ok)throw new ApiError(parsed.errors.join(' '));
 let metadata;try{metadata=parseRaceScenarioMetadata(body.metadata);assertScenarioTimeZone(parsed.value.startAt,metadata.timeZone);}catch(e){throw new ApiError((e as Error).message);}
 if(metadata.courses?.some(c=>!parsed.value.legs.some(l=>l.id===c.legId)))throw new ApiError('Course metadata does not match a scenario leg');
 if(metadata.eventDate&&parsed.value.startAt&&metadata.timeZone){const parts=new Intl.DateTimeFormat('en',{timeZone:metadata.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(parsed.value.startAt));const part=(key:string)=>parts.find(p=>p.type===key)?.value;const localDate=`${part('year')}-${part('month')}-${part('day')}`;if(localDate!==metadata.eventDate)throw new ApiError('Event date does not match the start instant in the selected time zone');}
 if(parsed.value.weather.kind==='forecast'){const w=metadata.weatherEvidence;if(!w||w.requestLatitude!==metadata.latitude||w.requestLongitude!==metadata.longitude||metadata.latitude===null||metadata.longitude===null||!w.requestedAt||!parsed.value.startAt||Date.parse(w.requestedAt)!==Date.parse(parsed.value.startAt)||w.timeZone!==metadata.timeZone)throw new ApiError('The forecast does not match this event location and start time. Look it up again or use manual conditions.');}
 if(metadata.raceId&&!state.races.some(r=>r.id===metadata.raceId))throw new ApiError('Race not found for this athlete',404);
 for(const leg of parsed.value.legs){
  const b=leg.baseline;if(!b)continue;
  if(b.source==='benchmark'){
   const a=state.anchors.find(a=>a.kind==='benchmark'&&a.id===b.sourceId);
   if(!a)throw new ApiError('Baseline not found for this athlete',404);
   if(!a.usable)throw new ApiError(a.reason??'Baseline is unavailable');
   const metric=a.unit==='W'?'power_w':a.unit==='sec/km'?'pace_sec_km':a.unit==='sec/100m'?'pace_sec_100m':null;
   if(b.sport!==a.sport||b.metric!==metric||b.value!==a.value||b.observedAt.slice(0,10)!==a.observedAt?.slice(0,10))throw new ApiError('The selected baseline changed. Reload its source, value, date and sport.',409);
   b.observedAt=a.observedAt!;
   b.context=a.context;
   b.protocol='Saved benchmark record; protocol not independently verified';
  }else if(b.sourceId!==null){throw new ApiError('Manual references cannot claim a saved benchmark ID');}
 }
 const result=calculateScenario(parsed.value);
 if(metadata.weatherEvidence)result.warnings.push('Weather provenance in this scenario is a user-reviewed copy of a provider reference; this save does not independently re-fetch or certify the provider values.');
 return {input:parsed.value,metadata,result};
}
