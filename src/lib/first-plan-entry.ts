/** An entry response must acknowledge an actual saved, owned plan. A missing
 * sport is a profile action, never evidence that training was saved. */
export function firstPlanEntryReceipt(value:unknown): "saved" | "choose_sport" | null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const data=value as Record<string,any>,plan=data.plan;
  if(data.ok!==true||!plan||typeof plan!=="object"||Array.isArray(plan))return null;
  if(plan.status==="choose_sport"&&plan.planId===null&&plan.created===false)return "choose_sport";
  if(!["existing","observation","reported_capacity"].includes(plan.status)||typeof plan.planId!=="string"||!plan.planId.trim()||typeof plan.created!=="boolean")return null;
  if(plan.status==="existing"&&plan.created!==false)return null;
  if(plan.status!=="existing"&&plan.created!==true)return null;
  return "saved";
}
