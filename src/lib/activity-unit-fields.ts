import { distanceToDisplay, distanceFromDisplay, weightToDisplay, weightFromDisplay, type UnitSystem } from "./units";
type Actuals={distanceKm:number|null;loadKg:number|null};
export function actualActivityFormValues(original:Actuals,units:UnitSystem) {
  return {actualDistanceKm:original.distanceKm==null?"":String(Number(distanceToDisplay(original.distanceKm,units).toFixed(6))),actualLoadKg:original.loadKg==null?"":String(Number(weightToDisplay(original.loadKg,units).toFixed(6)))};
}
/** Unchanged rounded input preserves its exact metric source value. */
export function actualActivityUnitPatch(fields:Record<string,unknown>,original:Actuals,units:UnitSystem) {
  const displayed=actualActivityFormValues(original,units);
  function value(name:keyof typeof displayed,previous:number|null,convert:(n:number,units:UnitSystem)=>number) {
    const raw=fields[name];if(raw==null||raw==="")return null;
    if(raw===displayed[name])return previous;
    if(typeof raw!=="string"||!raw.trim()||!Number.isFinite(Number(raw))||Number(raw)<0)throw Error("Enter a finite nonnegative actual measurement");
    return convert(Number(raw),units);
  }
  return {distanceKm:value("actualDistanceKm",original.distanceKm,distanceFromDisplay),loadKg:value("actualLoadKg",original.loadKg,weightFromDisplay)};
}
