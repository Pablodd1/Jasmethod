import { corosOAuthConfigured } from "./coros-oauth-config";
/** These stages describe implemented boundaries, never on-watch verification. */
export function nativeDeviceCapabilities(env: Record<string, string | undefined> = process.env) {
  return {
    coros: {
      stage: "protocol_review" as const,
      configured: corosOAuthConfigured(env),
      authorizationAvailable: corosOAuthConfigured(env),
      publishesStructuredWorkouts: false,
      importsActivities: false,
      watchReceiptVerified: false,
    },
    apple: {
      stage: "native_pilot" as const,
      exportEnabled: env.ENABLE_APPLE_WORKOUT_EXPORT === "true",
      companionDistributed: false,
      automaticSync: false,
      importsActivities: false,
      watchReceiptVerified: false,
    },
  };
}
