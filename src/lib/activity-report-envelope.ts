import { provenanceOf, type ProvenanceFields } from './strava-provenance';
export function activityReportEnvelope(report: { headline: string; body: string }) {
  return { schemaVersion: 1, provenanceReviewed: true, report };
}
export function readVerifiedActivityReport(insights: string | null | undefined, origin: ProvenanceFields): { headline: string; body: string } | null {
  if (!insights || provenanceOf(origin) !== 'allowed') return null;
  try {
    const value = JSON.parse(insights);
    return value?.schemaVersion === 1 && value.provenanceReviewed === true && typeof value.report?.headline === 'string' && typeof value.report?.body === 'string'
      ? { headline: value.report.headline, body: value.report.body } : null;
  } catch { return null; }
}
