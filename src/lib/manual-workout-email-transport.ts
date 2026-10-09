import nodemailer from "nodemailer";
export type ManualEmailReceipt = { status: "accepted" | "rejected" | "unknown"; receiptId?: string };
export interface ManualEmailMessage { to: string; subject: string; text: string; html: string; attachments?: { filename: string; content: Buffer; cid?: string }[] }
/** Provider acceptance is not inbox delivery. Never retry an ambiguous send. */
export async function sendManualEmail(message: ManualEmailMessage): Promise<ManualEmailReceipt> {
  if (!/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(message.to)) return { status: "rejected" };
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return { status: "rejected" };
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === "true",
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" } });
  try {
    const result = await transport.sendMail({ ...message, from: process.env.SMTP_FROM });
    const accepted = (result.accepted || []).some((v: string | { address: string }) => (typeof v === "string" ? v : v.address).toLowerCase() === message.to.toLowerCase());
    const rejected = (result.rejected || []).some((v: string | { address: string }) => (typeof v === "string" ? v : v.address).toLowerCase() === message.to.toLowerCase());
    return accepted ? { status: "accepted", receiptId: result.messageId } : { status: rejected ? "rejected" : "unknown" };
  } catch { return { status: "unknown" }; }
  finally { transport.close(); }
}
