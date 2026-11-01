/** Hours are an editing unit only. Persist integer minutes independently of
 * tolerated training; blank means unknown, while explicit zero stays zero. */
export function weeklyAvailabilityMinutes(value:unknown):number|null {
  if(value==null||value==='')return null;
  if((typeof value!=='string'&&typeof value!=='number')||(typeof value==='string'&&!/^\d+(?:\.\d+)?$/.test(value)))throw new Error('Enter available weekly hours as a number.');
  const minutes=Number(value)*60;
  if(!Number.isFinite(minutes)||minutes<0||minutes>2400||Math.abs(minutes-Math.round(minutes))>1e-8)throw new Error('Use available weekly hours equivalent to whole minutes, between 0 and 40 hours.');
  return Math.round(minutes);
}
