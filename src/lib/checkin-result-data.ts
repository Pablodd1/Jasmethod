import type { FuelBrand } from "./fuelbrands";

/** Optional display data must not take down the check-in form, including older [] responses. */
type DisplayFuelBrand = Pick<FuelBrand, "name" | "type" | "carbsG" | "sodiumMg">;
export function checkinFuelBrands(value: unknown): { brands: DisplayFuelBrand[]; note: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.note !== "string" || !Array.isArray(data.brands)) return null;
  if (!data.brands.every((brand): brand is DisplayFuelBrand => brand && typeof brand === "object"
    && ["name", "type", "carbsG", "sodiumMg"].every(key => typeof brand[key] === "string"))) return null;
  return { note: data.note, brands: data.brands };
}
