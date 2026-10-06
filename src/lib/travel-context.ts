/** Optional reported context. Never changes the account timezone or saved prescriptions. */
export interface TravelContext {
  startDate: string | null;
  endDate: string | null;
  destinationTimezone: string | null;
  equipmentNotes: string;
  timeNotes: string;
  maxSessionMinutes: number | null;
}

export function parseTravelContext(value: unknown): TravelContext | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid travel context");
  const input = value as Record<string, unknown>;
  const date = (key: string): string | null => {
    const raw = input[key];
    if (raw == null || raw === "") return null;
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) throw new Error(`Invalid travel ${key}`);
    return raw;
  };
  const startDate = date("startDate"), endDate = date("endDate");
  if (startDate && endDate && endDate < startDate) throw new Error("Travel end date must not precede start date");
  let destinationTimezone: string | null = null;
  if (input.destinationTimezone != null && input.destinationTimezone !== "") {
    if (typeof input.destinationTimezone !== "string" || input.destinationTimezone.length > 100) throw new Error("Invalid destination timezone");
    destinationTimezone = input.destinationTimezone.trim();
    try { new Intl.DateTimeFormat("en", { timeZone: destinationTimezone }).format(0); }
    catch { throw new Error("Invalid destination timezone"); }
  }
  const notes = (key: string): string => {
    if (input[key] == null) return "";
    if (typeof input[key] !== "string" || input[key].length > 1000) throw new Error(`Invalid travel ${key}`);
    return input[key].trim();
  };
  let maxSessionMinutes: number | null = null;
  if (input.maxSessionMinutes != null && input.maxSessionMinutes !== "") {
    const raw = input.maxSessionMinutes;
    if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !/^\d+$/.test(raw))) throw new Error("Invalid travel maximum minutes");
    maxSessionMinutes = Number(raw);
    if (!Number.isInteger(maxSessionMinutes) || maxSessionMinutes < 0 || maxSessionMinutes > 300) throw new Error("Travel maximum minutes must be between 0 and 300");
  }
  return { startDate, endDate, destinationTimezone, equipmentNotes: notes("equipmentNotes"), timeNotes: notes("timeNotes"), maxSessionMinutes };
}
