// Roundtrip check for the token encryption (run with TOKEN_ENCRYPTION_KEY set).
process.env.TOKEN_ENCRYPTION_KEY ??= "test-key-32-bytes-aaaaaaaaaaaaaa";
import("../src/lib/crypto").then(({ encryptSecret, decryptSecret }) => {
  const enc = encryptSecret("my-secret-token");
  const ok1 = enc.startsWith("enc:v1:");
  const ok2 = decryptSecret(enc) === "my-secret-token";
  const ok3 = decryptSecret("legacy-plain") === "legacy-plain";
  console.log("encrypted prefix ok:", ok1, "| roundtrip ok:", ok2, "| plaintext passthrough ok:", ok3);
  if (!ok1 || !ok2 || !ok3) process.exit(1);
});
