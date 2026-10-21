const fields = ["sleep","mood","soreness","motivation","energy","stress","sick","newPain","urgentSymptoms","menstrual","weightKg","rhr","hrv","sleepHours","availableMinutes","cycleDay","painLocation","painAffectsMovement","sessionFelt","voiceReviewConfirmed"] as const;
export type CheckinFormAnswers = Record<string, string | number | boolean>;
export const emptyCheckinAnswers = (): CheckinFormAnswers => Object.fromEntries(fields.map(field=>[field,field === "voiceReviewConfirmed" ? false : ""]));
const object = (value:unknown): value is Record<string,any> => !!value && typeof value === "object" && !Array.isArray(value);
const editable = (value:unknown): CheckinFormAnswers => object(value) ? Object.fromEntries(fields.filter(field=>["string","boolean"].includes(typeof value[field]) || typeof value[field] === "number" && Number.isFinite(value[field])).map(field=>[field,value[field]])) : {};

/** Only explicit editable answers hydrate the form; imported readings remain source-aware evidence. */
export function savedCheckinAnswers(raw:string|null|undefined):CheckinFormAnswers {
  const answers=emptyCheckinAnswers();if(!raw)return answers;
  const saved:unknown=JSON.parse(raw);if(!object(saved))return answers;
  Object.assign(answers,editable(saved));answers.availableMinutes=saved.availableMin ?? "";
  for(const [field,source] of [["rhr","rhrSource"],["hrv","hrvSource"],["sleepHours","sleepHoursSource"]]) {
    if(saved.inputMetadata?.[source] && saved.inputMetadata[source] !== "athlete-reported")answers[field]="";
  }
  if(saved.inputMetadata?.hrvType === "sdnn")answers.hrv="";
  answers.voiceReviewConfirmed=false;
  return answers;
}

export const checkinDraftKey=(userId:string)=>`jmm_checkin_draft_v1_${userId}`;
export function restoreCheckinDraft(raw:string|null,userId:string,dateLocal:string,savedBasis:string|null) {
  if(!raw || raw.length>100_000)return null;
  try {
    const draft:unknown=JSON.parse(raw);
    if(!object(draft)||draft.version!==1||draft.userId!==userId||draft.dateLocal!==dateLocal||draft.savedBasis!==savedBasis||!object(draft.answers)||!Array.isArray(draft.dirty))return null;
    const dirty=draft.dirty.filter((field:unknown):field is string=>typeof field==="string"&&(fields as readonly string[]).includes(field));
    return {answers:editable(draft.answers),dirty,correctImported:draft.correctImported===true};
  }catch{return null;}
}

/** A refresh may update evidence, never replace fields edited in this tab. */
export function hydrateCheckinDraft(saved:CheckinFormAnswers,current:CheckinFormAnswers,dirty:readonly string[]) {
  return {...saved,...Object.fromEntries(dirty.filter(field=>Object.hasOwn(current,field)).map(field=>[field,current[field]]))};
}
