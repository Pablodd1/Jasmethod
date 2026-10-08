import {ApiError,errorResponse} from './access';
export const SCENARIO_HEADERS={'Cache-Control':'private, no-store'};
export async function readScenarioJson(req:Request,maxBytes=512*1024):Promise<Record<string,unknown>>{
 const declared=req.headers.get('content-length');
 if(declared&&Number(declared)>maxBytes)throw new ApiError('Request is too large',413);
 if(!req.body)throw new ApiError('A JSON body is required');
 const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new ApiError('Request is too large',413);}chunks.push(value);}}finally{reader.releaseLock();}
 let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError('Invalid JSON body');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError('A JSON object is required');
 return body as Record<string,unknown>;
}
export function scenarioError(e:unknown){const response=errorResponse(e);response.headers.set('Cache-Control','private, no-store');return response;}
