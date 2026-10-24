/** A successful HTTP response is necessary but insufficient for a visible save receipt. */
export async function readWriteReceipt(response:Response,entity?:"log"|"race",expectedId?:string) {
  let value:Record<string,unknown>;
  try {value=await response.json();} catch {throw Error("The save response could not be verified. Reload before retrying.");}
  if(!response.ok||!value||value.ok!==true)throw Error(typeof value?.error==="string"?value.error:"Saving was not confirmed. Your draft has been retained.");
  if(entity&&(!value[entity]||typeof value[entity]!=="object"||typeof (value[entity] as {id?:unknown}).id!=="string"||!(value[entity] as {id:string}).id))throw Error("A saved record receipt was not returned. Reload before retrying.");
  if(entity&&expectedId&&(value[entity] as {id:string}).id!==expectedId)throw Error("The save receipt does not match this record. Reload before retrying.");
  return value;
}
