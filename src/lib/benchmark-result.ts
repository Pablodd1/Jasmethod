export function benchmarkResult(type: string, input: unknown) {
  const ranges: Record<string, [number, number]> = {ftp:[20,700], cp:[20,700], lthr:[60,230], run5k:[600,7200], swim:[30,600]};
  if (!ranges[type]) throw Error("Unsupported benchmark type");
  if (input === null || input === "" || typeof input === "boolean") throw Error("A measured result is required");
  const result = Number(input), [min,max] = ranges[type];
  if (!Number.isFinite(result) || result < min || result > max) throw Error(`Result must be between ${min} and ${max} for ${type}`);
  // Only direct measurements update the matching anchor. A 5 km time is not a measured threshold.
  const field = ({ftp:"ftp", cp:"cp", lthr:"lthr", swim:"swimPaceBase"} as Record<string,string>)[type];
  return {result, patch: field ? {[field]: type === "lthr" ? Math.round(result) : result} : {}};
}
