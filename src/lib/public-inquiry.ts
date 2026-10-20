export const INQUIRY_TOPICS = ["demo", "coaching", "partnership", "question"] as const;
export type InquiryTopic = (typeof INQUIRY_TOPICS)[number];
export type PublicInquiry = { name: string; email: string; topic: InquiryTopic; message: string };
export const INQUIRY_MAX_BYTES = 4096;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
export function parsePublicInquiry(value: unknown): PublicInquiry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.consent !== true || typeof v.name !== "string" || typeof v.email !== "string" ||
      typeof v.topic !== "string" || typeof v.message !== "string" ||
      typeof v.website !== "string" || v.website.trim() !== "") return null;
  const name = v.name.trim(), email = v.email.trim(), message = v.message.trim();
  if (name.length < 2 || name.length > 80 || email.length > 254 ||
      !/^[^\s@<>;,]+@[^\s@<>;,]+\.[A-Za-z]{2,}$/.test(email) ||
      message.length < 20 || message.length > 1500 ||
      (CONTROL.test(name) || /[\r\n]/.test(name)) || (CONTROL.test(email) || /[\r\n]/.test(email)) || CONTROL.test(message) ||
      !INQUIRY_TOPICS.includes(v.topic as InquiryTopic)) return null;
  return { name, email, topic: v.topic as InquiryTopic, message };
}
export function inquiryEmailText(q: PublicInquiry): string {
  return [
    "JMM website inquiry", "Topic: " + q.topic, "Name: " + q.name,
    "Reply email: " + q.email, "", q.message, "",
    "Submitted with the visitor's explicit consent on the public contact form.",
    "Do not interpret this as a coaching or medical intake."
  ].join("\n");
}
