export type ManualWorkoutAttempt = { clientRequestId:string; payloadKey:string };

/** Flat manual-report fields have a stable key independent of form field order. */
export function manualWorkoutPayloadKey(fields: Record<string,unknown>) {
  return JSON.stringify(Object.fromEntries(Object.keys(fields).filter(key=>key!=="clientRequestId").sort().map(key=>[key,fields[key]])));
}

export function manualWorkoutRequestId(body: unknown): string | null {
  if(!body||typeof body!=="object"||Array.isArray(body))throw Error("Expected an activity report");
  const value=(body as Record<string,unknown>).clientRequestId;
  // Older clients remain accepted but do not receive a replay guarantee.
  if(value===undefined)return null;
  if(typeof value!=="string"||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw Error("Invalid activity request ID");
  return value;
}

/** Keep an uncertain request stable; changed fields start a new logical attempt. */
export function manualWorkoutAttempt(previous:ManualWorkoutAttempt|null, fields:Record<string,unknown>, createId:()=>string):ManualWorkoutAttempt {
  const payloadKey=manualWorkoutPayloadKey(fields);
  return previous?.payloadKey===payloadKey ? previous : {clientRequestId:createId(),payloadKey};
}
