// JasMiamiMethod — Display units (metric | imperial)
//
// ALL storage stays metric (kg, km, ml, °C). These helpers convert ONLY at
// the display layer so nothing in the science/fuel engines ever branches on
// units. Explicit choices win; automatic English uses miles, Spanish uses km.

export type UnitSystem = "metric" | "imperial";

export function unitsOf(v: string | null | undefined, language?: string | null): UnitSystem {
  if (v === "imperial" || v === "metric") return v;
  return language?.toLowerCase().split("-")[0] === "en" ? "imperial" : "metric";
}

const LB_PER_KG = 2.20462;
const KM_PER_MI = 1.609344;
const CM_PER_IN = 2.54;

export function fmtWeight(kg: number | null | undefined, units: UnitSystem): string {
  if (kg == null || !Number.isFinite(kg)) return "—";
  return units === "imperial"
    ? `${(kg * LB_PER_KG).toFixed(1)} lb`
    : `${kg.toFixed(1)} kg`;
}

export function fmtHeight(cm: number | null | undefined, units: UnitSystem): string {
  if (cm == null || !Number.isFinite(cm)) return "—";
  if (units === "metric") return `${Math.round(cm)} cm`;
  const totalIn = cm / CM_PER_IN;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return `${ft}'${inch}"`;
}

export function fmtDistance(
  km: number | null | undefined,
  units: UnitSystem,
): string {
  if (km == null || !Number.isFinite(km)) return "—";
  if (units === "imperial") {
    const mi = km / KM_PER_MI;
    // 1 decimal up to 30 mi (5.0, 13.1, 26.2 — the classic race numbers)
    return `${mi < 30 ? mi.toFixed(1) : Math.round(mi)} mi`;
  }
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function fmtTemp(c: number | null | undefined, units: UnitSystem): string {
  if (c == null || !Number.isFinite(c)) return "—";
  return units === "imperial"
    ? `${Math.round((c * 9) / 5 + 32)}°F`
    : `${Math.round(c)}°C`;
}

export function fmtVolume(ml: number | null | undefined, units: UnitSystem): string {
  if (ml == null || !Number.isFinite(ml)) return "—";
  return units === "imperial"
    ? `${Math.round(ml / 29.5735)} oz`
    : `${Math.round(ml)} ml`;
}

// Dual label for hydration plans where the product world is imperial
// (bottles are oz) even for metric athletes: "500 ml (17 oz)".
export function fmtVolumeDual(ml: number | null | undefined, units: UnitSystem): string {
  if (ml == null || !Number.isFinite(ml)) return "—";
  const oz = Math.round(ml / 29.5735);
  return units === "imperial"
    ? `${oz} oz (${Math.round(ml)} ml)`
    : `${Math.round(ml)} ml (${oz} oz)`;
}

export function fmtPace(
  secPerKm: number | null | undefined,
  units: UnitSystem,
): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "—";
  const s = units === "imperial" ? secPerKm * KM_PER_MI : secPerKm;
  const rounded = Math.round(s);
  const m = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return `${m}:${String(sec).padStart(2, "0")}/${units === "imperial" ? "mi" : "km"}`;
}
