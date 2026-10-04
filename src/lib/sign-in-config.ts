export const signInProviders = ["google", "apple", "chatgpt"] as const;
export type SignInProvider = typeof signInProviders[number];
export const signInLabels = { google: "Google", apple: "Apple", chatgpt: "ChatGPT" };

export function signInBase(req: Request): string {
  const value = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const url = new URL(value || req.url);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new Error("Invalid application origin");
  if (process.env.NODE_ENV === "production" && !value) throw new Error("Missing application origin");
  return url.origin;
}

export function signInConfig(provider: SignInProvider) {
  // Demo defaults to Google. Credentials alone never enable another provider.
  const enabled = (process.env.SIGN_IN_PROVIDERS ?? "google").split(",").map(value => value.trim());
  if (!enabled.includes(provider)) return null;
  if (provider === "google") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
    return { clientId: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET,
      issuer: "https://accounts.google.com", authorize: "https://accounts.google.com/o/oauth2/v2/auth",
      token: "https://oauth2.googleapis.com/token", jwks: "https://www.googleapis.com/oauth2/v3/certs", method: "client_secret_post" };
  }
  if (provider === "apple") {
    if (!["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"].every(k => process.env[k])) return null;
    return { clientId: process.env.APPLE_CLIENT_ID!, secret: "", issuer: "https://appleid.apple.com",
      authorize: "https://appleid.apple.com/auth/authorize", token: "https://appleid.apple.com/auth/token",
      jwks: "https://appleid.apple.com/auth/keys", method: "client_secret_post" };
  }
  // Website identity requires a registered client; never use dynamic OSS registration here.
  const method = process.env.CHATGPT_TOKEN_AUTH_METHOD || "client_secret_basic";
  if (!process.env.CHATGPT_CLIENT_ID || !["none", "client_secret_basic"].includes(method) ||
    (method !== "none" && !process.env.CHATGPT_CLIENT_SECRET)) return null;
  return { clientId: process.env.CHATGPT_CLIENT_ID, secret: process.env.CHATGPT_CLIENT_SECRET || "",
    issuer: "https://auth.openai.com", authorize: "https://auth.openai.com/api/accounts/authorize",
    token: "https://auth.openai.com/api/accounts/oauth/token", jwks: "https://auth.openai.com/.well-known/jwks.json", method };
}
