// JasMiamiMethod — secret encryption at rest (OAuth tokens).
// AES-256-GCM with a key from TOKEN_ENCRYPTION_KEY (32-byte hex/base64 or any
// string; derived via scrypt). Stored format: "enc:v1:<iv>:<tag>:<ct>".
//
// GRACEFUL DEGRADATION for the free demo phase: when no key is configured the
// functions pass values through unchanged (with a one-time warning), so local
// and demo environments keep working exactly as before. Set the key in
// production and tokens are encrypted transparently — decrypt() accepts both
// encrypted and legacy plaintext values, so nothing breaks on upgrade.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const PREFIX = "enc:v1:";
let warned = false;
let key: Buffer | null = null;

function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "TOKEN_ENCRYPTION_KEY is required for OAuth in production",
      );
    if (!warned) {
      console.warn(
        "[crypto] TOKEN_ENCRYPTION_KEY not set — OAuth tokens stored UNENCRYPTED (demo mode). Set it in production.",
      );
      warned = true;
    }
    return null;
  }
  if (!key) key = scryptSync(raw, "jmm-token-salt", 32);
  return key;
}

export function encryptSecret(value: string): string {
  if (!value) return value;
  const k = getKey();
  if (!k) return value; // demo mode passthrough
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext
  const k = getKey();
  if (!k) throw new Error("Encryption key missing");
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      k,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
