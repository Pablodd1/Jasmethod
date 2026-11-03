import { createHash } from "node:crypto";

export function commanderRequestHash(raw:Record<string,unknown>) {
  // Omitted/false preserves historical receipt fingerprints. Opting in is a
  // distinct planning basis and must never replay a normal-plan receipt.
  return createHash("sha256").update(JSON.stringify({weeks:raw.weeks,startDate:raw.startDate,easyPct:raw.easyPct??null,trainingWindow:raw.trainingWindow??null,sourceMessageId:raw.sourceMessageId??null,confirmDoubleDay:raw.confirmDoubleDay===true,confirmEventTradeoffs:raw.confirmEventTradeoffs===true,...(raw.manualBaselinePlanning===true?{manualBaselinePlanning:true}:{})})).digest("hex");
}
