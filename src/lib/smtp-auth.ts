type SmtpEnvironment = Record<string, string | undefined>;
const isGmail = (env: SmtpEnvironment) => env.SMTP_HOST?.trim().toLowerCase() === "smtp.gmail.com";

/** Google displays app passwords as four groups. Preserve arbitrary/non-Google passwords. */
export function smtpAuth(env: SmtpEnvironment) {
  const user = env.SMTP_USER || "", original = env.SMTP_PASS || "";
  if (!isGmail(env)) return { user, pass: original };
  const trimmed = original.trim();
  const displayed = /^[A-Za-z0-9]{4}(?:\s+[A-Za-z0-9]{4}){3}$/.test(trimmed);
  const plain = /^[A-Za-z0-9]{16}$/.test(trimmed);
  return { user: user.trim(), pass: displayed ? trimmed.replace(/\s/g, "") : plain ? trimmed : original };
}

/** Administrator-only shape checks, never the sender address, password, or fragments. */
export function gmailSmtpFormatHint(env: SmtpEnvironment): string {
  if (!isGmail(env)) return "";
  const auth = smtpAuth(env);
  const login = /^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(auth.user)
    ? "Gmail sender login has email-address format. " : "Gmail sender login needs a valid email address in SMTP_USER. ";
  const password = /^[A-Za-z0-9]{16}$/.test(auth.pass)
    ? "Gmail app-password format has 16 characters; this does not verify that Google accepts it. "
    : "SMTP_PASS does not match a 16-character Google app-password format. Review the saved value securely. ";
  return login + password + (auth.pass !== (env.SMTP_PASS || "") ? "Copied app-password whitespace is removed before authentication. " : "");
}
