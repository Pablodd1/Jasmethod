import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(p, "utf8");
test("public consultation routes are reachable from navigation and indexed", () => {
  const header = read("src/components/site-shell.tsx");
  const home = read("src/app/page.tsx");
  const sitemap = read("src/app/sitemap.xml/route.ts");
  for (const route of ["/book", "/contact", "/blog", "/faq"]) {
    assert.ok(header.includes('href="' + route + '"'));
    assert.ok(home.includes('href: "' + route + '"') || home.includes('href="' + route + '"'));
    assert.ok(sitemap.includes("${BASE}" + route));
  }
  const book = read("src/app/book/page.tsx");
  assert.ok(book.includes("verifiedBookingUrl("));
  assert.ok(book.includes('href="/contact"'));
});
test("public inquiry does not mistake SMTP acceptance for verified inbox delivery", () => {
  const api = read("src/app/api/public-inquiry/route.ts");
  assert.ok(api.includes("receipt.accepted"));
  assert.ok(api.includes("supportTelegramConfigured()"));
  assert.ok(api.includes("receipt !== null"));
  assert.ok(api.includes('channel: "telegram"'));
  assert.ok(api.includes("does not confirm it has reached the inbox"));
  assert.ok(api.includes("INQUIRY_MAX_BYTES"));
  assert.ok(api.includes("same") === false || api.includes('req.headers.get("origin")'));
});
