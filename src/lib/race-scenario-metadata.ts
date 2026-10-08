export interface ScenarioCourseContext {legId:string;source:'gpx'|'manual'|'flat';sourceUrl:string|null;label:string;importedAt:string|null;profile:{distanceM:number;elevationM:number|null;segmentIndex?:number}[];warnings:string[]}
/** Context retained separately from the numerical model. URL labels are user attestations. */
export interface RaceScenarioMetadata {
 eventDate?:string|null;raceId:string|null;location:string|null;officialUrl:string|null;timeZone:string|null;latitude:number|null;longitude:number|null;
 course:{sourceUrl:string|null;label:string;importedAt:string|null;profile:{distanceM:number;elevationM:number|null}[];warnings:string[]}|null;
 courses?:ScenarioCourseContext[];
 weatherEvidence:{requestLatitude?:number|null;requestLongitude?:number|null;requestedAt?:string|null;timeZone?:string|null;provider:string;sourceUrl:string|null;licenseUrl:string|null;retrievedAt:string|null;validAt:string|null;kind:string;attribution:string}|null;
}
const obj=(v:unknown)=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid scenario metadata');return v as Record<string,unknown>;};
const text=(v:unknown,max=300):string|null=>{if(v===undefined||v===null||v==='')return null;if(typeof v!=='string'||v.length>max)throw Error('Context text is invalid or too long');return v.trim()||null;};
const num=(v:unknown,min:number,max:number):number|null=>{if(v===undefined||v===null||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Invalid context coordinate or profile value');return v;};
function url(v:unknown){const s=text(v,2000);if(!s)return null;const u=new URL(s);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Source links must be ordinary HTTP or HTTPS URLs without credentials');return u.toString();}
function timestamp(v:unknown){const s=text(v,50);if(s&&(!/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(s)||!Number.isFinite(Date.parse(s))))throw Error('Use a timestamp with an explicit UTC offset');return s;}
export function parseRaceScenarioMetadata(value:unknown):RaceScenarioMetadata{
 const m=value===undefined||value===null?{}:obj(value);
 if(Object.keys(m).some(k=>!['eventDate','raceId','location','officialUrl','timeZone','latitude','longitude','course','courses','weatherEvidence'].includes(k)))throw Error('Unexpected scenario metadata field');
 const eventDate=text(m.eventDate,10);if(eventDate&&(!/^\d{4}-\d\d-\d\d$/.test(eventDate)||!Number.isFinite(Date.parse(eventDate))||new Date(eventDate).toISOString().slice(0,10)!==eventDate))throw Error('Use a valid event date');
 const timeZone=text(m.timeZone,100);if(timeZone){try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{throw Error('Choose a valid IANA time zone');}}
 let course:RaceScenarioMetadata['course']=null;
 if(m.course!=null){const c=obj(m.course);if(!Array.isArray(c.profile)||c.profile.length>2000)throw Error('Course profile must contain at most 2,000 points');let previous=-1;const profile=c.profile.map(p=>{const q=obj(p),distanceM=num(q.distanceM,0,2_000_000),elevationM=num(q.elevationM,-500,9000);if(distanceM===null||distanceM<previous)throw Error('Course profile distance must be increasing');previous=distanceM;return {distanceM,elevationM};});if(c.warnings!==undefined&&(!Array.isArray(c.warnings)||c.warnings.length>30))throw Error('Too many course warnings');course={sourceUrl:url(c.sourceUrl),label:text(c.label,200)??'User-supplied course',importedAt:timestamp(c.importedAt),profile,warnings:(c.warnings as unknown[]|undefined??[]).map(w=>text(w,400)??'')};}
 let courses:ScenarioCourseContext[]|undefined;
 if(m.courses!==undefined){if(!Array.isArray(m.courses)||m.courses.length>10)throw Error('At most 10 leg courses are supported');courses=m.courses.map(entry=>{const c=obj(entry);const legId=text(c.legId,100);if(!legId||!['gpx','manual','flat'].includes(String(c.source)))throw Error('Leg course source and id are required');const parsed=parseRaceScenarioMetadata({course:c}).course!;return {...parsed,legId,source:c.source as ScenarioCourseContext['source'],profile:parsed.profile.map((p,i)=>{const original=obj((c.profile as unknown[])[i]);if(original.segmentIndex===undefined)return p;const segmentIndex=num(original.segmentIndex,0,100000);if(segmentIndex===null||!Number.isInteger(segmentIndex))throw Error('Invalid course segment index');return {...p,segmentIndex};})};});if(new Set(courses.map(c=>c.legId)).size!==courses.length)throw Error('Duplicate leg courses');}
 let weatherEvidence:RaceScenarioMetadata['weatherEvidence']=null;
 if(m.weatherEvidence!=null){const w=obj(m.weatherEvidence);weatherEvidence={requestLatitude:num(w.requestLatitude,-90,90),requestLongitude:num(w.requestLongitude,-180,180),requestedAt:timestamp(w.requestedAt),timeZone:text(w.timeZone,100),provider:text(w.provider,100)??'User-supplied source',sourceUrl:url(w.sourceUrl),licenseUrl:url(w.licenseUrl),retrievedAt:timestamp(w.retrievedAt),validAt:timestamp(w.validAt),kind:text(w.kind,50)??'unknown',attribution:text(w.attribution,1000)??''};}
 return {eventDate,raceId:text(m.raceId,100),location:text(m.location),officialUrl:url(m.officialUrl),timeZone,latitude:num(m.latitude,-90,90),longitude:num(m.longitude,-180,180),course,...(courses?{courses}:{}),weatherEvidence};
}
/** Z is an unambiguous UTC instant; an explicit local offset must agree with the chosen zone. */
export function assertScenarioTimeZone(startAt:string|null,timeZone:string|null){
 if(!startAt||!timeZone||startAt.endsWith('Z'))return;
 const match=startAt.match(/([+-])(\d{2}):(\d{2})$/);if(!match)throw Error('Event time needs a UTC offset');
 const displayed=new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'longOffset'}).formatToParts(new Date(startAt)).find(p=>p.type==='timeZoneName')?.value;
 const expected=`GMT${match[1]}${match[2]}:${match[3]}`;
 if(displayed!==expected&&!(displayed==='GMT'&&Number(match[2])===0&&Number(match[3])===0))throw Error('Event UTC offset does not match the selected time zone on this date');
}
