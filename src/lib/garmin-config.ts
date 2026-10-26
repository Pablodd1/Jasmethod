/** Garmin approval and deployment readiness are separate. Never infer one from a key. */
export class GarminError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message); this.name = "GarminError";
  }
}
export type GarminEnvironment = Record<string, string | undefined>;
export function garminOrigin(env: GarminEnvironment = process.env): string {
  try {
    const url = new URL(env.APP_URL || env.NEXT_PUBLIC_APP_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new GarminError("provider_unavailable", "Garmin connection is awaiting deployment configuration.", 503); }
}
export function garminCredentials(env: GarminEnvironment = process.env) {
  const origin = garminOrigin(env);
  if (!env.GARMIN_CLIENT_ID || !/^[A-Za-z0-9_-]{1,128}$/.test(env.GARMIN_CLIENT_ID)
      || !env.GARMIN_CLIENT_SECRET || /\s/.test(env.GARMIN_CLIENT_SECRET)
      || !env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 32) {
    throw new GarminError("provider_unavailable", "Garmin connection is awaiting credential and data-recipient verification.", 503);
  }
  return { origin, redirectUri: `${origin}/api/connectors/garmin/callback`, clientId: env.GARMIN_CLIENT_ID, clientSecret: env.GARMIN_CLIENT_SECRET };
}
export function garminConfig(env: GarminEnvironment = process.env) {
  if (env.ENABLE_GARMIN_CONNECTOR !== "true" || env.GARMIN_PROCESSING_APPROVED !== "true")
    throw new GarminError("provider_unavailable", "Garmin connection is awaiting data-recipient verification.", 503);
  return garminCredentials(env);
}
export function garminConfigured(env: GarminEnvironment = process.env): boolean {
  try { garminConfig(env); return true; } catch { return false; }
}
export const GARMIN_CONSENT_VERSION = "garmin-direct-v1";
export const GARMIN_AUTO_CONSENT = "garmin-auto-publish-v1";
export const GARMIN_MANUAL_REVOCATION_VERSION = "garmin-manual-revocation-reported-v1";
export const GARMIN_NOTICE = {
  en: "Connect your own Garmin account. Choose the permissions in Garmin. Starter access supplies new data after consent; it does not import historical records. Garmin data stays out of external AI and other delivery channels. Authorization is separate from imports, workout publication and watch receipt.",
  es: "Conecta tu propia cuenta de Garmin. Elige los permisos en Garmin. El acceso Starter entrega datos nuevos después del consentimiento; no importa el historial. Los datos de Garmin no se envían a IA externa ni a otros canales de entrega. Autorizar no confirma importaciones, publicación de entrenamientos ni recepción en el reloj.",
} as const;
