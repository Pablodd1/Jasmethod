import { PUBLIC_CONTACT_EMAIL } from "./public-contact";

export type SupportContacts = { email: string | null; telegramUsername: string | null };
export const supportCategories = { login: "Account and sign-in", device: "Device connection or workout delivery", question: "Question or inquiry" } as const;
export type SupportCategory = keyof typeof supportCategories;

// Use the shared verified mailbox, even if an old SUPPORT_EMAIL remains deployed.
// Never derive public destinations from credentials or redirects.
export function supportContacts(env: Record<string, string | undefined>): SupportContacts {
  const username = (env.SUPPORT_TELEGRAM_USERNAME?.trim() || "").replace(/^@/, "");
  return {
    email: PUBLIC_CONTACT_EMAIL,
    telegramUsername: /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null,
  };
}

export function supportEmailDraft(email: string, category: SupportCategory): string {
  const subject = `JMM support: ${supportCategories[category]}`;
  const body = "What happened or what would you like to ask?\n\nSteps to reproduce (if relevant):\n\nExpected result:\n\nDevice/provider and browser (if relevant):\n\nPlease do not include passwords, verification codes, API keys, or health records.\n";
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
