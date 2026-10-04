export type SupportContacts = { email: string | null; telegramUsername: string | null };
export const supportCategories = { login: "Account and sign-in", device: "Device connection or workout delivery", question: "Question or inquiry" } as const;
export type SupportCategory = keyof typeof supportCategories;

// Explicit public destinations only. Never derive from credentials or redirects.
export function supportContacts(env: Record<string, string | undefined>): SupportContacts {
  const email = env.SUPPORT_EMAIL?.trim() || "";
  const username = (env.SUPPORT_TELEGRAM_USERNAME?.trim() || "").replace(/^@/, "");
  return {
    email: email.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email) ? email : null,
    telegramUsername: /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : null,
  };
}

export function supportEmailDraft(email: string, category: SupportCategory): string {
  const subject = `JMM support: ${supportCategories[category]}`;
  const body = "What happened or what would you like to ask?\n\nSteps to reproduce (if relevant):\n\nExpected result:\n\nDevice/provider and browser (if relevant):\n\nPlease do not include passwords, verification codes, API keys, or health records.\n";
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
