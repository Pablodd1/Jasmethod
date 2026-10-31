import test from "node:test";
import assert from "node:assert/strict";
import { smtpAuth, gmailSmtpFormatHint } from "./smtp-auth";

test("Gmail displayed app-password whitespace is normalized without modifying arbitrary passwords or providers",()=>{
  const env={SMTP_HOST:"smtp.gmail.com",SMTP_USER:" sender@example.invalid ",SMTP_PASS:" abcd efgh ijkl mnop\n"};
  assert.deepEqual(smtpAuth(env),{user:"sender@example.invalid",pass:"abcdefghijklmnop"});
  assert.equal(smtpAuth({...env,SMTP_PASS:"abcdefghijklmnop"}).pass,"abcdefghijklmnop");
  for(const pass of ['"abcdefghijklmnop"'," arbitrary password ","abcde fgh ijkl mnop"])assert.equal(smtpAuth({...env,SMTP_PASS:pass}).pass,pass);
  for(const host of ["smtp.example.invalid","smtp.gmail.com.attacker.invalid"])assert.deepEqual(smtpAuth({...env,SMTP_HOST:host}),{user:env.SMTP_USER,pass:env.SMTP_PASS});
});

test("Gmail format hints expose only shape categories and do not claim authentication",()=>{
  const env={SMTP_HOST:"smtp.gmail.com",SMTP_USER:"private@example.invalid",SMTP_PASS:"abcd efgh ijkl mnop"};
  const hint=gmailSmtpFormatHint(env);assert.match(hint,/does not verify/);assert.match(hint,/whitespace is removed/);
  for(const secret of [env.SMTP_USER,env.SMTP_PASS,smtpAuth(env).pass])assert.ok(!hint.includes(secret));
  assert.match(gmailSmtpFormatHint({...env,SMTP_USER:"not-an-email",SMTP_PASS:"wrong"}),/needs a valid email address.*does not match/);
  assert.equal(gmailSmtpFormatHint({...env,SMTP_HOST:"private.example.invalid"}),"");
  assert.doesNotMatch(gmailSmtpFormatHint({SMTP_HOST:"smtp.gmail.com"}),/whitespace is removed/);
});
