// JasMiamiMethod — Best fuel brands (endurance nutrition, evidence-tiered).
// Real products; dosing notes map to the ACSM/AIS fueling guidelines baked
// into the app (60-90g carbs/h, 400-1000mg sodium/L, 2:1 glucose:fructose).

export interface FuelBrand {
  name: string;
  type: string;      // gel | drink | electrolyte | solid
  carbsG: string;    // per serving
  sodiumMg: string;  // per serving
  tier: "top" | "solid" | "budget";
  note: string;
}

export const FUEL_BRANDS: FuelBrand[] = [
  { name: "Maurten Gel 100", type: "gel", carbsG: "25g", sodiumMg: "~0mg", tier: "top", note: "Hydrogel — the pro standard (Kipchoge's marathon fuel). Easiest on the gut; pairs with salt caps for sodium." },
  { name: "SiS Beta Fuel", type: "drink/gel", carbsG: "80g", sodiumMg: "varies", tier: "top", note: "2:1 glucose:fructose ratio — hits the 90g/h ceiling without gut issues (Jeukendrup 2014)." },
  { name: "Precision Fuel & Hydration", type: "drink/gel", carbsG: "varies", sodiumMg: "up to 1500mg", tier: "top", note: "Sodium-first, personalized to your sweat rate. Best for heavy sweaters / hot races." },
  { name: "GU Energy Gel", type: "gel", carbsG: "22g", sodiumMg: "55mg", tier: "solid", note: "The most widely used gel; maltodextrin+fructose, caffeine options (GU Roctane)." },
  { name: "Skratch Labs Hydration", type: "drink", carbsG: "21g", sodiumMg: "380mg", tier: "solid", note: "Real-food electrolyte drink, gentle on gut. Lower carb — pair with a gel." },
  { name: "Tailwind Endurance Fuel", type: "drink", carbsG: "25g/scoop", sodiumMg: "303mg", tier: "solid", note: "All-in-one calories + electrolytes, dissolves clear. Popular for long rides." },
  { name: "Honey Stinger", type: "solid/gel", carbsG: "19g", sodiumMg: "55mg", tier: "solid", note: "Honey-based real-food option (waffles + gels)." },
  { name: "LMNT / Nuun", type: "electrolyte", carbsG: "0-1g", sodiumMg: "1000mg (LMNT)", tier: "budget", note: "Electrolytes only — pair with solid carbs for anything over an hour." },
];

export function fuelBrandsFor(durationMin: number): { brands: FuelBrand[]; note: string } {
  if (durationMin < 60) {
    return { brands: FUEL_BRANDS.filter((b) => b.type === "electrolyte"), note: "Under 60 min — water + electrolytes only; no carbs needed." };
  }
  if (durationMin < 90) {
    return { brands: FUEL_BRANDS.filter((b) => b.type !== "electrolyte"), note: "30-60g carbs/h — one gel or a carb drink per hour." };
  }
  return { brands: FUEL_BRANDS, note: "60-90g carbs/h — combine a 2:1 carb drink (SiS/Maurten) with a gel; add sodium if hot." };
}
