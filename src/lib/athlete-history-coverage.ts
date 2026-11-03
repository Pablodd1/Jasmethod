export type AthleteHistoryCoverage = { status: "available" | "withheld"; days: number | null };

/** Excluded history is unknown, never an observation of zero training history. */
export function athleteHistoryCoverage(activityStatus: unknown, days: unknown): AthleteHistoryCoverage {
  return activityStatus === "allowed" && typeof days === "number" && Number.isInteger(days) && days >= 0
    ? { status:"available", days }
    : { status:"withheld", days:null };
}

export function athleteHistorySummary(coverage: AthleteHistoryCoverage, coldStart: boolean, es: boolean) {
  if (coverage.status === "withheld") return es
    ? "Tu historial guardado se conserva, pero aún no puede usarse para este análisis. La cobertura es desconocida; no significa que no hayas entrenado."
    : "Your saved history is preserved but cannot yet be used for this analysis. Coverage is unknown; this does not mean you have not trained.";
  if (coldStart) return es
    ? `Historial utilizable: ${coverage.days} días. Podemos empezar con lo que declares y revisar el plan al disponer de más información.`
    : `Usable history: ${coverage.days} days. We can start from what you report and review the plan as more information becomes available.`;
  return es ? "Faltan algunos datos para personalizar tu entrenamiento." : "A few details are missing to personalize your training.";
}
