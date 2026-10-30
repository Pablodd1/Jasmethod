import { readManualPersonalBests } from "./onboarding-evidence";
export const BASELINE_TESTS = [
  {type:"run5k",sport:"run",en:"Run · 5 km finish time (m:ss)",es:"Carrera · tiempo en 5 km (m:ss)"},
  {type:"lthr",sport:"run",en:"Run · threshold heart rate (bpm)",es:"Carrera · frecuencia cardíaca umbral (bpm)"},
  {type:"ftp",sport:"bike",en:"Bike · FTP (W)",es:"Ciclismo · FTP (W)"},
  {type:"cp",sport:"bike",en:"Bike · critical power (W)",es:"Ciclismo · potencia crítica (W)"},
  {type:"swim",sport:"swim",en:"Swim · CSS",es:"Natación · CSS"},
] as const;
export function baselineSport(goal: string | null | undefined) {
  return goal==="cycle"?"bike":goal==="swim-only"?"swim":["sprint","olympic","half","full"].includes(goal||"")?"multisport":goal==="hyrox"?"hyrox":["run-only","track-sprint","5k","10k","half-marathon","marathon"].includes(goal||"")?"run":"multisport";
}
export function baselineTestOptions(sport: string) {
  return BASELINE_TESTS.filter(test=>sport==="multisport"||test.sport===(sport==="hyrox"?"run":sport));
}
/** Presence guides the first assessment offer, never establishes a usable anchor. */
export function initialAssessmentEvidence(trainingRecords: number, manualPrs: string | null | undefined, completedTests: number) {
  let personalRecords:"present"|"missing"|"review"="missing";
  if(manualPrs){const rows=readManualPersonalBests(manualPrs);personalRecords=!rows||rows.some(row=>row.value<=0||!row.unit.trim())?"review":rows.length?"present":"missing";}
  return {trainingRecords,personalRecords,completedTests,needsInitialAssessment:trainingRecords===0&&personalRecords==="missing"&&completedTests===0};
}
