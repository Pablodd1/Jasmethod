/** Display adapters only. APIs and device exports keep their canonical units. */
export function clockText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const rounded = Math.round(seconds * 1000) / 1000;
  const minutes = Math.floor(rounded / 60), remainder = rounded - minutes * 60;
  const [whole, decimal] = remainder.toFixed(3).replace(/\.?0+$/, "").split(".");
  return `${minutes}:${whole.padStart(2, "0")}${decimal ? `.${decimal}` : ""}`;
}
export function clockSeconds(text: string): number {
  const value = text.trim().replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 60;
  const match = /^(\d+):([0-5]\d(?:\.\d+)?)(?::([0-5]\d(?:\.\d+)?))?$/.exec(value);
  if (!match || (match[3] !== undefined && match[2].includes("."))) throw Error("Use minutes, m:ss or h:mm:ss");
  return match[3] === undefined ? Number(match[1]) * 60 + Number(match[2])
    : Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
export function metricEntry(text: string, clock: boolean, factor = 1): string {
  if (!text.trim()) return "";
  const normalized = text.trim().replace(",", ".");
  if (!clock && !/^-?\d+(?:\.\d+)?$/.test(normalized)) throw Error("Enter a valid number");
  const value = (clock ? clockSeconds(normalized) : Number(normalized)) / factor;
  if (!Number.isFinite(value) || !Number.isFinite(factor) || factor <= 0) throw Error("Invalid units");
  return String(value);
}
