// Small browser capability boundary, injectable for cancel/error regression tests.
export type TransferOutcome = "shared" | "cancelled" | "downloaded";
export async function shareOrDownloadFit(file: File, title: string, browser: {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files: File[]; title: string }) => Promise<void>;
  download: () => void;
}): Promise<TransferOutcome> {
  let available = false;
  try { available = !!browser.share && !!browser.canShare?.({ files: [file] }); } catch { /* download fallback */ }
  if (available && browser.share) {
    try { await browser.share({ files: [file], title }); return "shared"; }
    catch (cause) { if ((cause as Error)?.name === "AbortError") return "cancelled"; }
  }
  browser.download();
  return "downloaded";
}

export function fitDownloadUrl(sessionId: string, revision: string): string {
  return `/api/workout/approve?${new URLSearchParams({ sessionId, expectedRevision: revision })}`;
}
