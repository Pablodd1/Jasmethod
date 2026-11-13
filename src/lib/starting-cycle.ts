import { addDaysKey } from "./dates";
import { starterSession, starterRestriction, STARTER_SESSION_MINUTES } from "./starter-session";
import type { PlanningSetup } from "./planning-setup";

export const STARTING_CYCLE_VERSION = "observation-week-v1";
export function isStartingCycle(value:unknown): value is ReturnType<typeof startingCycle> {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const p=value as Record<string,any>;
  return p.version===STARTING_CYCLE_VERSION && /^\d{4}-\d{2}-\d{2}$/.test(p.startKey) &&
    ["review_required","daily_checkin_required"].includes(p.status) &&
    ["saved_availability","suggested_for_review"].includes(p.scheduleSource) &&
    Array.isArray(p.reasons)&&p.reasons.every((r:any)=>r&&["key","en","es"].every(key=>typeof r[key]==="string")) &&
    Array.isArray(p.days)&&p.days.length===7&&p.days.every((d:any)=>d&&typeof d.dateKey==="string"&&Number.isFinite(d.minutes)&&d.minutes>=0&&d.minutes<=STARTER_SESSION_MINUTES&&["existing_record","review","observation","open"].includes(d.kind));
}
/** A reviewable product starting suggestion, never an inferred training baseline. */
export function startingCycle(profile: {goal?:string|null;birthYear?:number|null;injured?:boolean;weeklyHours?:number|null}|null,
  setup: PlanningSetup|null, startKey: string, unavailableDays: string[] = [], provenanceHold = false, now = new Date()) {
  const esReasons: Record<string,string> = {
    adult: "Confirma la elegibilidad para el programa de adultos.",
    restrictions: "Revisa las restricciones actuales o la vuelta tras una interrupción con tu coach o profesional cualificado.",
    provenance: "El origen de parte del historial no permite usarlo para adaptar el entrenamiento todavía.",
    availability: "El tiempo disponible guardado no permite una observación de un minuto. Revisa tu disponibilidad cuando cambie.",
  };
  const reasons: {key:string;en:string;es:string}[] = [];
  // A birth year alone cannot establish an eighteenth birthday has occurred.
  const adult = setup?.adultConfirmed || !!(profile?.birthYear && now.getUTCFullYear()-profile.birthYear > 18);
  if (!adult) reasons.push({key:"adult",en:"Confirm eligibility for the adult program.",es:esReasons.adult});
  if (starterRestriction(profile,setup,now)) reasons.push({key:"restrictions",en:"Review current restrictions or return after an interruption with your coach or qualified professional.",es:esReasons.restrictions});
  if (provenanceHold) reasons.push({key:"provenance",en:"Some history cannot yet be used for training adaptation because its origin needs review.",es:esReasons.provenance});
  const availableMinutes = setup?.availableWeeklyMinutes ?? (typeof profile?.weeklyHours === "number" && Number.isFinite(profile.weeklyHours) ? profile.weeklyHours * 60 : 3 * STARTER_SESSION_MINUTES);
  if (availableMinutes < 1) reasons.push({key:"availability",en:"Saved availability does not allow a one-minute observation. Review your available time when it changes.",es:esReasons.availability});
  const base = starterSession(profile?.goal);
  const weekday = new Date(`${startKey}T12:00Z`).getUTCDay();
  const slots = setup?.trainingDays.length ? Array.from({length:7},(_,slot)=>slot).filter(slot=>setup.trainingDays.includes((weekday+slot)%7)).slice(0,3) : [0,2,4];
  let remaining = Math.max(0, Math.min(3 * STARTER_SESSION_MINUTES, availableMinutes));
  let observationIndex = 0;
  const days = Array.from({length:7},(_,slot)=>{
    const dateKey = addDaysKey(startKey,slot), selected = slots.includes(slot), occupied = unavailableDays.includes(dateKey);
    const minutes = selected && !occupied && !reasons.length ? Math.max(0,Math.floor(Math.min(STARTER_SESSION_MINUTES,setup?.maxSessionMinutes ?? STARTER_SESSION_MINUTES,remaining))) : 0;
    remaining -= minutes;
    const session = starterSession(profile?.goal, null, minutes > 0 ? observationIndex++ : undefined);
    return { dateKey, slot, selected, occupied, minutes, sport: session.sport, description: session.description, kind: occupied ? "existing_record" as const : selected ? reasons.length ? "review" as const : "observation" as const : "open" as const };
  });
  return { version:STARTING_CYCLE_VERSION, startKey, days, reasons, base, scheduleSource:setup?.trainingDays.length ? "saved_availability" : "suggested_for_review", totalMinutes:days.reduce((sum,day)=>sum+day.minutes,0),
    status:reasons.length ? "review_required" : "daily_checkin_required", progression:false, physiologicalTargets:false };
}
