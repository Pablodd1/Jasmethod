/** Planned session labels are allocation evidence, never measured time in zones. */
export function plannedAerobicDistribution(rows: readonly {sport?:string;type?:string;intensity?:string|null;durationMin?:number|null;planned?:boolean}[]) {
  const aerobic=rows.filter(row=>row.planned!==false && ["run","bike","swim"].includes(row.sport ?? "") && !["strength","plyo","brick"].includes(row.type ?? ""));
  const incomplete=aerobic.some(row=>typeof row.durationMin!=="number"||!Number.isFinite(row.durationMin)||row.durationMin<0||!/^z[1-7]$/.test(row.intensity ?? ""));
  const totalMinutes=aerobic.reduce((sum,row)=>sum+(typeof row.durationMin==="number"&&Number.isFinite(row.durationMin)&&row.durationMin>0?row.durationMin:0),0);
  const easyMinutes=aerobic.filter(row=>["z1","z2"].includes(row.intensity ?? "")).reduce((sum,row)=>sum+(row.durationMin ?? 0),0);
  return {totalMinutes,easyMinutes,easyPct:incomplete||!totalMinutes?null:Math.round(easyMinutes/totalMinutes*100),sessionCount:aerobic.length};
}
