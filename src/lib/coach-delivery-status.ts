export function asksGarminDeliveryStatus(message: string): boolean {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/’/g, "'").toLowerCase();
  return /\bgarmin\b/.test(text)
    && /\b(?:workout|workouts|session|sessions|prescription|sesion|sesiones|entrenamiento|entrenamientos)\b/.test(text)
    && /\b(?:status|delivery|published|scheduled|sent|sync|synced|missing|appear|isn't in|not in|estado|entrega|publico|publicad[oa]|programad[oa]|enviad[oa]|sincroniz\w*|no aparece)\b/.test(text);
}

type PublicationStatus = "schedule_verified" | "withdrawn" | "working" | "workout_created" | "failed" | "unknown";

export type CoachGarminStatus = {
  available: boolean;
  receipt: { date: string; status: PublicationStatus } | null;
};

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function publicationStatus(status: unknown, stage: unknown): PublicationStatus {
  if (status === "published" && stage === "schedule_verified") return "schedule_verified";
  if (status === "cancelled" && stage === "withdrawn") return "withdrawn";
  if (status === "working") {
    return stage === "created" || stage === "scheduling" ? "workout_created" : "working";
  }
  if (status === "failed") return "failed";
  return "unknown";
}

/** Read only the selected session's safe display fields from the owner's preferences response. */
export function readCoachGarminStatus(value: unknown, sessionId: string): CoachGarminStatus | null {
  if (!object(value) || typeof value.available !== "boolean" || !Array.isArray(value.receipts)) return null;
  const receipt = value.receipts.find((item: unknown) => object(item) && item.sessionId === sessionId);
  if (!receipt) return { available: value.available, receipt: null };
  if (receipt.deviceReceived !== false || typeof receipt.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)) return null;
  return {
    available: value.available,
    receipt: { date: receipt.date, status: publicationStatus(receipt.status, receipt.stage) },
  };
}
