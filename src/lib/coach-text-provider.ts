import { resolveCheckinSafety } from "./checkin-safety";
import { educationalCatalog } from "./coach-conversation-education";
import { PROTOCOL_SOURCES } from "./protocols";
import { externalCoachContext } from "./coach-personal-context";
import type { CoachReplyContext } from "./coach-conversation";
import { type CoachCandidate } from './coach-conversation';


export interface CoachTextEnvironment { EXTERNAL_AI_ENABLED?: string; OPENAI_API_KEY?: string; OPENAI_TEXT_MODEL?: string }
export interface CoachTextResult {
  status: "not_requested" | "not_configured" | "policy_local" | "answered" | "unavailable";
  answer?: string; sourceIds?: string[]; candidates?:CoachCandidate[];needsHumanReview?:boolean;
}
export type CoachTextFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const MAX_REQUEST_BYTES = 32 * 1024, MAX_RESPONSE_BYTES = 64 * 1024;

const models = new Set(["gpt-4.1-mini-2025-04-14", "gpt-4.1-mini"]);
function currentEnvironment(): CoachTextEnvironment { return { EXTERNAL_AI_ENABLED: process.env.EXTERNAL_AI_ENABLED, OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL }; }
export function coachTextConfigured(env: CoachTextEnvironment = currentEnvironment()): boolean {
  return typeof window === "undefined" && env.EXTERNAL_AI_ENABLED === "true" && typeof env.OPENAI_API_KEY === "string" && /^[\x21-\x7e]{1,1024}$/.test(env.OPENAI_API_KEY) && models.has(env.OPENAI_TEXT_MODEL || "gpt-4.1-mini-2025-04-14");
}
// Safety, personal context, proposals and all writes remain server-owned.
// The external model receives only a fixed educational topic.
const allowedRules = new Set(["greeting","acknowledgment"]);
export function textProviderQuestionAllowed(message: string, ruleId: string): boolean {
  if (typeof message !== "string" || !message.trim() || message.length > 4000 || !ruleId.startsWith("coach-conversation-v1:")) return false;
  const rule = ruleId.slice("coach-conversation-v1:".length);
  if (!allowedRules.has(rule) && !/^education-(?:rpe|endurance|polarized|periodization|recovery|warmup|technique)$/.test(rule)) return false;
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return !/\b(?:strava|pain|injur\w*|chest|sick|illness|fever|faint\w*|medical|diagnos\w*|clearance|dolor|lesion\w*|enferm\w*|fiebre|desmay\w*|medic\w*|diagnostic\w*)\b/.test(text)
    && !/\b(?:ignore (?:all|previous|system)|system prompt|developer message|ignora|reveal|exfiltrate|api[_ -]?key|password|secret|token)\b/.test(text);
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<any> {
  if (!response.body || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw Error("Invalid response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort",cancel,{ once:true }); let bytes = 0;
  try {
    while (true) { signal.throwIfAborted(); const { value, done } = await reader.read(); signal.throwIfAborted(); if(done)break;
      bytes += value.length; if(bytes > MAX_RESPONSE_BYTES)throw Error("Response limit"); chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { signal.removeEventListener("abort",cancel); cancel(); }
}
function validatedAnswer(raw: unknown, payload: string,grounded:CoachCandidate[]=[]): { answer: string; sourceIds: string[]; changes?:unknown;needsHumanReview?:boolean } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(k=>!['answer','sourceIds','changes','needsHumanReview'].includes(k)) || (value.needsHumanReview!==undefined&&typeof value.needsHumanReview!=='boolean') || (value.changes!==undefined&&(!Array.isArray(value.changes)||value.changes.length>12)) || typeof value.answer !== "string" || !value.answer.trim() || value.answer.length > 3500 || !Array.isArray(value.sourceIds) || value.sourceIds.length > 3) return null;
  if(value.sourceIds.some(id => typeof id !== "string" || !Object.hasOwn(PROTOCOL_SOURCES,id)) || new Set(value.sourceIds).size !== value.sourceIds.length)return null;
  const text = value.answer.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  // Advisory prose cannot become an executable workout, diagnosis or success receipt.
  if (/(?:https?:\/\/|www\.|<[^>]*>|```)/i.test(value.answer)
    || /\b(?:i (?:have )?(?:saved|updated|changed|sent|published|scheduled|approved)|you (?:are|have been) (?:medically )?cleared|guarantee\w*|diagnos\w*|cures?|prescrib\w*|reset (?:your |the )?(?:nervous|autonomic)|he (?:guardado|actualizado|cambiado|enviado|publicado)|estas autorizad[oa]|garantiz\w*|diagnostic\w*)\b/.test(text)
    || /\b(?:take|consume|ingest|toma|consume|ingiere)\b[^.!?\n]{0,70}\b(?:mg|grams?|g\/|capsul\w*|tablets?|caffeine|cafeina|nitrate|nitrato)\b/.test(text)
    || /\b(?:milligrams?|miligramos?|grams?|gramos?|mg|g\/kg|g\/h)\b/.test(text)
    || /\b(?:you (?:can|may) (?:train|exercise|run|ride|swim)|(?:safe|ready) to (?:train|exercise|run)|puedes (?:entrenar|correr|nadar)|list[oa] para entrenar)\b/.test(text)
    || /\b(?:do|perform|add|run|ride|swim|haz|realiza|anade|corre|nada)\s+(?:(?:at least|up to|another|an extra|al menos|hasta|otros?)\s+)?(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)\b/.test(text)) return null;
  const knownNumbers = new Set(payload.match(/\d+(?:\.\d+)?/g) || []);
  for(const candidate of grounded)if(typeof candidate.value==='number')knownNumbers.add(String(candidate.value));
  if ((value.answer.match(/\d+(?:\.\d+)?/g) || []).some(number => !knownNumbers.has(number))) return null;
  const sourceIds = value.sourceIds as string[];
  const references = sourceIds.map(id => { const ref=PROTOCOL_SOURCES[id as keyof typeof PROTOCOL_SOURCES]; return `${ref.title}: ${ref.url}`; });
  return { answer: [value.answer.trim(), ...references].join("\n\n"), sourceIds, ...(value.changes!==undefined?{changes:value.changes}:{}),...(value.needsHumanReview===true?{needsHumanReview:true}:{}) };
}
export async function coachTextAnswer(input: {
  message: string; localRuleId: string; context: CoachReplyContext; externalConsent: boolean; aiReplyMemoryConsent?:boolean;textProviderConsent?: "openai"; hasCandidates: boolean;
}, options: { env?: CoachTextEnvironment; fetch?: CoachTextFetch } = {}): Promise<CoachTextResult> {
  if (input.externalConsent !== true || input.textProviderConsent !== "openai") return { status: "not_requested" };
  const env=options.env ?? currentEnvironment();
  if (!coachTextConfigured(env)) return { status:"not_configured" };
  if (input.hasCandidates || !textProviderQuestionAllowed(input.message,input.localRuleId) || input.context.unreviewedImageConcern || input.context.unresolvedSafetyConcernAt) return { status:"policy_local" };
  if(["hold","urgent"].includes(resolveCheckinSafety(input.context.checkin).status))return {status:"policy_local"};
  const context = externalCoachContext(input.context,input.aiReplyMemoryConsent===true);

  const payload=JSON.stringify({ topic:input.localRuleId.slice("coach-conversation-v1:".length), context,
    changeFields:[],editingLimits:"Generic education only. No athlete facts, memory, personal analysis or change proposals are provided or permitted.",
    approvedEducation:Object.entries(educationalCatalog).map(([topic, paragraphs])=>({topic,paragraphs:paragraphs.map(p=>p[context.language])})),
    references:PROTOCOL_SOURCES,
  });
  const body=JSON.stringify({model:env.OPENAI_TEXT_MODEL || "gpt-4.1-mini-2025-04-14",stream:false,store:false,temperature:.2,max_tokens:1400,response_format:{type:"json_object"},messages:[
    {role:"system",content:"You provide general sports education in the supplied language using only the supplied topic and reviewed catalog. No athlete context, user text, session, device data or chat history is provided. Do not infer or request those data, personalize an answer, claim to know a goal/history, diagnose, clear exercise, prescribe doses, create workouts, predict results or propose changes. Return JSON {\"answer\":\"brief general explanation\",\"sourceIds\":[],\"changes\":[]}. Only supplied source IDs may be referenced. Never claim anything was saved, sent or approved."},
    {role:"user",content:payload},
  ]});
  if(Buffer.byteLength(body,"utf8") > MAX_REQUEST_BYTES)return {status:"policy_local"};
  const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("Provider timeout"));},12000);});
  try { return await Promise.race([deadline,(async():Promise<CoachTextResult>=>{
    const response=await(options.fetch ?? fetch)("https://api.openai.com/v1/chat/completions",{method:"POST",redirect:"error",referrerPolicy:"no-referrer",cache:"no-store",credentials:"omit",headers:{"Content-Type":"application/json",Authorization:`Bearer ${env.OPENAI_API_KEY!}`},signal:controller.signal,body});
    if(!response.ok)return{status:"unavailable"};
    const generated=await boundedJson(response,controller.signal), choice=generated?.choices?.[0];
    if(choice?.finish_reason!=="stop"||choice.message?.role!=="assistant"||choice.message?.refusal||choice.message?.tool_calls?.length||typeof choice.message?.content!=="string"||choice.message.content.length>4500)return{status:"unavailable"};
    const raw=JSON.parse(choice.message.content);
    const candidates:CoachCandidate[]=[];
    const result=validatedAnswer(raw,payload,candidates);
    if(!result)return {status:'unavailable'};
    if(Array.isArray(raw.changes)&&raw.changes.length!==candidates.length)return {status:'unavailable'};
    return {status:'answered',answer:result.answer,sourceIds:result.sourceIds,...(result.needsHumanReview?{needsHumanReview:true}:{}),...(candidates.length?{candidates}:{})};
  })()]); } catch { return {status:"unavailable"}; }
  finally {if(timer!==undefined)clearTimeout(timer);controller.abort();}
}
