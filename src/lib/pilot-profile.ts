type Basics={sex:string;weight:string};
/** Untouched imported weight must retain its provenance when another field changes. */
export function pilotProfilePatch(draft:Basics,saved:Basics,observationId:string|null){
  const fields:Record<string,unknown>={};
  if(draft.sex!==saved.sex)fields.sex=draft.sex||null;
  if(draft.weight!==saved.weight||observationId){
    fields.weightKg=draft.weight===""?null:draft.weight;
    if(observationId)fields.reviewedWeightObservationId=observationId;
  }
  return fields;
}
