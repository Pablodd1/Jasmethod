import { weightToDisplay, weightFromDisplay, heightToFeetInches, heightFromFeetInches, type UnitSystem } from "./units";
import { convertProgressValue } from "./target-progress";

/** Human-facing profile fields, with canonical metric storage kept unchanged. */
export function profileUnitFormValues(profile: Record<string, any>, units: UnitSystem): Record<string, string> {
  const result: Record<string,string> = {};
  if (profile.weightKg != null) result.weightKg = String(Number(weightToDisplay(profile.weightKg,units).toFixed(1)));
  if (profile.heightCm != null) {
    if (units === "metric") result.heightCm=String(profile.heightCm);
    else { const value=heightToFeetInches(profile.heightCm), inches=Number(value.inches.toFixed(2)); result.heightFeet=String(value.feet+(inches===12?1:0)); result.heightInches=String(inches===12?0:inches); }
  }
  for (const field of ["runPaceBase","swimPaceBase"]) if (profile[field] != null) {
    const seconds=units === "metric" ? profile[field] : convertProgressValue(profile[field],field === "runPaceBase" ? "sec/km" : "sec/100m",field === "runPaceBase" ? "sec/mi" : "sec/100yd");
    const rounded=Math.round(seconds); result[field]=`${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,"0")}`;
  }
  return result;
}

export function profileUnitPatch(fields:Record<string,any>, profile:Record<string,any>, units:UnitSystem) {
  const patch={...fields}, previous=profileUnitFormValues(profile,units);
  const number=(value:unknown)=>{if(typeof value!=="string"||!value.trim()||!Number.isFinite(Number(value)))throw Error("Enter a valid measurement");return Number(value);};
  if(Object.hasOwn(fields,"weightKg") && fields.weightKg!=="") patch.weightKg=fields.weightKg===previous.weightKg ? profile.weightKg : weightFromDisplay(number(fields.weightKg),units);
  if(units==="imperial" && (Object.hasOwn(fields,"heightFeet")||Object.hasOwn(fields,"heightInches"))) {
    if(fields.heightFeet==="" && fields.heightInches==="") patch.heightCm="";
    else if(fields.heightFeet===previous.heightFeet && fields.heightInches===previous.heightInches) patch.heightCm=profile.heightCm;
    else { const feet=number(fields.heightFeet), inches=number(fields.heightInches); if(!Number.isInteger(feet)||feet<0||inches<0||inches>=12)throw Error("Enter feet and inches from 0 to less than 12");patch.heightCm=heightFromFeetInches(feet,inches); }
    delete patch.heightFeet; delete patch.heightInches;
  }
  for(const field of ["runPaceBase","swimPaceBase"]) if(Object.hasOwn(fields,field) && fields[field]!=="") {
    if(fields[field]===previous[field]) {patch[field]=profile[field];continue;}
    const match=/^(\d+):([0-5]\d(?:\.\d+)?)$/.exec(String(fields[field]));
    if(!match)throw Error("Enter pace as minutes:seconds, for example 8:03");
    const seconds=Number(match[1])*60+Number(match[2]);
    patch[field]=units==="metric"?seconds:convertProgressValue(seconds,field==="runPaceBase"?"sec/mi":"sec/100yd",field==="runPaceBase"?"sec/km":"sec/100m");
  }
  return patch;
}
