import { createHash } from "node:crypto";

export function commanderRequestHash(raw:Record<string,unknown>) {
  return createHash("sha256").update(JSON.stringify({weeks:raw.weeks,startDate:raw.startDate,easyPct:raw.easyPct??null,trainingWindow:raw.trainingWindow??null,sourceMessageId:raw.sourceMessageId??null,confirmDoubleDay:raw.confirmDoubleDay===true,confirmEventTradeoffs:raw.confirmEventTradeoffs===true})).digest("hex");
}
