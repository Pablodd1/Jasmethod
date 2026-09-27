export function messageInput(value: unknown) {
  const b = value as Record<string,unknown> | null;
  if (!b || typeof b.body !== "string" || !b.body.trim() || b.body.trim().length > 4000) throw Error("Message must contain 1–4000 characters");
  if (typeof b.clientId !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(b.clientId)) throw Error("A valid message identifier is required");
  return {body: b.body.trim(), clientId: b.clientId};
}
