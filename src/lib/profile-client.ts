// Shared browser contract: never fetch a fresh revision just before writing
// stale form values, and never retry a conflict automatically.
export async function saveReviewedProfile(fields: Record<string, unknown>, revision: string | null, request: typeof fetch = fetch) {
  if (!revision) throw Error("Reload your profile before saving.");
  const response = await request("/api/profile", {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...fields, expectedRevision:revision})});
  const data = await response.json();
  if (!response.ok) throw Error(response.status === 409
    ? "The profile changed. Reload this page, review the current values and enter your changes again. Nothing was resubmitted."
    : data.error || "Could not save profile.");
  return data;
}

export function onboardingProfileFields(fields: Record<string, unknown>) {
  const normalized = {...fields};
  for (const key of ["birthYear", "sex", "heightCm", "weightKg"])
    if (normalized[key] === "") normalized[key] = null;
  return normalized;
}
