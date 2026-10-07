import type { CanonicalSession, TargetProfile } from './canonical-session';
import { isDemanding } from './protocols';
// Conservative load classification for a second-session review, not time-in-zone.
export function canonicalDemand(session: CanonicalSession, profile?: TargetProfile | null): 'demanding' | 'easy' | 'unknown' {
  if (session.verdict !== 'ready' || !session.steps.length) return 'unknown';
  if (isDemanding({sport:session.sport,durationMin:session.durationMin})) return 'demanding';
  let unknown=false;
  for(const step of session.steps) {
    const sport=step.componentSport || session.sport;
    if (Number(step.zone.slice(1)) >= 3 || isDemanding({sport,durationMin:step.seconds/60})) return 'demanding';
    const t=step.target;
    if (t.type==='open' || t.type==='swimStroke') continue;
    if (t.type==='power' && sport==='bike' && profile?.ftp) { if(t.high! > profile.ftp*.75) return 'demanding'; }
    else if(t.type==='heartRate' && ['run','bike'].includes(sport) && profile?.lthr) { if(t.high! > profile.lthr*.89) return 'demanding'; }
    else if((t.type==='pace'||t.type==='speed') && sport==='run' && profile?.runPaceBase) { if(t.type==='pace' ? t.low! < profile.runPaceBase*1.2 : t.high! > 1000/(profile.runPaceBase*1.2)) return 'demanding'; }
    else unknown=true;
  }
  return unknown?'unknown':'easy';
}
export function canonicalFuelIntensity(session: CanonicalSession, stated: unknown, profile?: TargetProfile | null) {
  const zones=session.steps.map(s=>Number(s.zone.slice(1))).filter(Number.isFinite);
  const declared=typeof stated==='string' && /^z[1-7]$/.test(stated)?Number(stated.slice(1)):1;
  // Peak planned label is a conservative fueling input, never measured time-in-zone.
  const highTarget=session.steps.some(s=> {
    const sport=s.componentSport || session.sport, t=s.target;
    return (t.type==='power' && sport==='bike' && profile?.ftp && t.high!>profile.ftp*.9)
      || (t.type==='heartRate' && ['run','bike'].includes(sport) && profile?.lthr && t.high!>profile.lthr*.94)
      || (t.type==='pace' && sport==='run' && profile?.runPaceBase && t.low!<profile.runPaceBase*1.08)
      || (t.type==='speed' && sport==='run' && profile?.runPaceBase && t.high!>1000/(profile.runPaceBase*1.08));
  });
  const peak=Math.max(declared,...zones,highTarget?4:1);
  return `z${Math.min(7,peak)}`;
}
